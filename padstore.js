'use strict';
// The launchpads people build. A pad is a record (name, look, owner, fee share) plus a logo picture. Creating one
// needs the owner's wallet to sign a message, so nobody can make a pad "owned" by a wallet they do not control.
// With a data folder (a Railway volume) pads survive restarts; without one they live in memory.
const fs = require('fs');
const path = require('path');
const { verifySignature } = require('./sigverify');
const { blockedWord, normalizeLinks, imageType } = require('./art');
const pads = require('./pads');

const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;
const HEX6 = /^#[0-9a-fA-F]{6}$/;
const RESERVED = new Set(['build', 'api', 'p', 'coin', 'admin', 'art', 'meta', 'healthz', 'www', 'app', 'pad', 'pads', 'new', 'edit', 'login', 'about', 'help', 'support', 'buildapad', 'static', 'assets', 'pad-logo']);
const MAX_LOGO_BYTES = 400000;
const MAX_PER_WALLET = 3;
const SIGNATURE_WINDOW_MS = 10 * 60 * 1000;

const clean = (v, max) => (typeof v === 'string' ? v.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');

// The exact text the owner signs. It names the pad, the wallet and the fee share, so a signature cannot be reused for
// anything else.
function messageFor(f) {
  return 'BuildAPad: create the launchpad "' + f.slug + '" owned by ' + f.ownerWallet + ' with a ' + f.ownerPct + '% fee share. Time: ' + f.ts;
}

// Black or white text, whichever reads better on the accent colour.
function onAccent(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.2126 * (n >> 16 & 255) + 0.7152 * (n >> 8 & 255) + 0.0722 * (n & 255)) / 255;
  return lum > 0.58 ? '#0a0b0d' : '#ffffff';
}

function createPadStore(opts) {
  const o = opts || {};
  const file = o.file || '';
  const logoDir = o.logoDir || '';
  const now = o.now || Date.now;
  const logger = o.logger || console;
  const platformPct = Number.isFinite(o.platformPct) ? o.platformPct : 10;
  const maxOwnerPct = Math.max(0, 50 - platformPct); // the launcher always keeps at least half
  const perIpPerHour = o.perIpPerHour || 5;
  const hits = new Map();
  const logos = new Map(); // slug -> Buffer, for pads made while there is no data folder, and as a read cache

  let entries = [];
  if (file) {
    try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); if (Array.isArray(j)) entries = j.filter(valid); } catch (err) { /* first run */ }
  }

  function valid(e) {
    return e && typeof e === 'object' && SLUG_RE.test(e.slug || '') && typeof e.name === 'string' && B58.test(e.ownerWallet || '') && Number.isFinite(e.createdAt) && (e.logoExt === 'png' || e.logoExt === 'jpg');
  }
  function save() {
    if (!file) return;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file + '.tmp', JSON.stringify(entries));
      fs.renameSync(file + '.tmp', file);
    } catch (err) { logger.error('Pad list save failed: ' + (err && err.message)); }
  }
  function allowed(ip) {
    const t = now();
    const recent = (hits.get(ip) || []).filter(x => t - x < 3600000);
    if (recent.length >= perIpPerHour) { hits.set(ip, recent); return false; }
    recent.push(t); hits.set(ip, recent);
    if (hits.size > 2000) for (const [k, v] of hits) if (!v.some(x => t - x < 3600000)) hits.delete(k);
    return true;
  }

  const publicView = e => ({
    slug: e.slug, name: e.name, tagline: e.tagline, accent: e.accent, corners: e.corners,
    ownerWallet: e.ownerWallet, ownerPct: e.ownerPct, links: e.links || {}, createdAt: e.createdAt,
    logoUrl: '/pad-logo/' + e.slug + '.' + e.logoExt
  });

  // Validates the form, checks the wallet's signature, and stores the pad. Never throws.
  function create(input, ctx) {
    const b = input && typeof input === 'object' ? input : {};
    const slug = typeof b.slug === 'string' ? b.slug.trim().toLowerCase() : '';
    if (!SLUG_RE.test(slug)) return { status: 400, body: { error: 'bad_slug' } };
    if (RESERVED.has(slug)) return { status: 400, body: { error: 'slug_reserved' } };
    const name = clean(b.name, 30);
    if (name.length < 2) return { status: 400, body: { error: 'bad_name' } };
    if (blockedWord(name + ' ' + slug)) return { status: 400, body: { error: 'blocked_name' } };
    const tagline = clean(b.tagline, 90);
    if (tagline && blockedWord(tagline)) return { status: 400, body: { error: 'blocked_name' } };
    const accent = typeof b.accent === 'string' && HEX6.test(b.accent) ? b.accent.toLowerCase() : '';
    if (!accent) return { status: 400, body: { error: 'bad_color' } };
    const corners = b.corners === 'sharp' ? 'sharp' : b.corners === 'round' || b.corners === undefined ? 'round' : '';
    if (!corners) return { status: 400, body: { error: 'bad_options' } };
    const ownerPct = b.ownerPct;
    if (!Number.isInteger(ownerPct) || ownerPct < 0 || ownerPct > maxOwnerPct) return { status: 400, body: { error: 'bad_fee_share', max: maxOwnerPct } };
    if (typeof b.ownerWallet !== 'string' || !B58.test(b.ownerWallet)) return { status: 400, body: { error: 'bad_wallet' } };
    const links = normalizeLinks(b.links === undefined ? {} : b.links);
    if (links === null) return { status: 400, body: { error: 'bad_links' } };

    let logo = null;
    if (typeof b.logo === 'string' && b.logo.length <= Math.ceil(MAX_LOGO_BYTES * 4 / 3) + 8) {
      const buf = Buffer.from(b.logo, 'base64');
      const ext = buf.length >= 100 && buf.length <= MAX_LOGO_BYTES ? imageType(buf) : null;
      if (ext) logo = { buf, ext };
    }
    if (!logo) return { status: 400, body: { error: 'bad_logo' } };

    // The signature proves the wallet's owner asked for exactly this pad, recently.
    const ts = b.ts;
    if (!Number.isFinite(ts) || Math.abs(now() - ts) > SIGNATURE_WINDOW_MS) return { status: 400, body: { error: 'stale_signature' } };
    if (!verifySignature(b.ownerWallet, messageFor({ slug, ownerWallet: b.ownerWallet, ownerPct, ts }), b.signature)) return { status: 401, body: { error: 'bad_signature' } };

    if (!allowed((ctx && ctx.ip) || 'unknown')) return { status: 429, body: { error: 'rate_limited' } };
    if (entries.some(e => e.slug === slug)) return { status: 409, body: { error: 'slug_taken' } };
    if (entries.filter(e => e.ownerWallet === b.ownerWallet).length >= MAX_PER_WALLET) return { status: 409, body: { error: 'too_many_pads' } };

    const entry = { slug, name, tagline, accent, corners, ownerWallet: b.ownerWallet, ownerPct, links, logoExt: logo.ext === 'jpg' ? 'jpg' : 'png', createdAt: now() };
    if (logoDir) {
      try { fs.mkdirSync(logoDir, { recursive: true }); fs.writeFileSync(path.join(logoDir, slug + '.' + entry.logoExt), logo.buf); }
      catch (err) { logger.error('Pad logo save failed: ' + (err && err.message)); return { status: 500, body: { error: 'server_error' } }; }
    }
    logos.set(slug, logo.buf);
    entries.push(entry);
    save();
    return { status: 201, body: { pad: publicView(entry) } };
  }

  const get = slug => { const e = entries.find(x => x.slug === slug); return e ? publicView(e) : null; };
  const list = (limit) => entries.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, limit || 12).map(publicView);

  // The logo picture: { buf, ext } or null.
  function logo(slug) {
    const e = entries.find(x => x.slug === slug);
    if (!e) return null;
    let buf = logos.get(slug);
    if (!buf && logoDir) { try { buf = fs.readFileSync(path.join(logoDir, slug + '.' + e.logoExt)); logos.set(slug, buf); } catch (err) { buf = null; } }
    return buf ? { buf, ext: e.logoExt } : null;
  }

  // The pad as the page templates want it (see pads.js): wording, colours and corner radius.
  function toPad(slug) {
    const e = entries.find(x => x.slug === slug);
    if (!e) return null;
    const pad = pads.normalize({
      id: e.slug, name: e.name, tagline: e.tagline || 'Launch a coin.', description: (e.tagline || 'Launch a coin') + ' on ' + e.name + ', a Solana launchpad built with BuildAPad.',
      theme: { dark: { accent: e.accent, 'on-accent': onAccent(e.accent), edge: e.accent }, radius: e.corners === 'sharp' ? 2 : 14 }
    }, 'pad ' + e.slug);
    pad.extra = { slug: e.slug, ownerWallet: e.ownerWallet, ownerPct: e.ownerPct, logoUrl: '/pad-logo/' + e.slug + '.' + e.logoExt, links: e.links || {} };
    return pad;
  }

  return { create, get, list, logo, toPad, maxOwnerPct, platformPct, messageFor, size: () => entries.length };
}

module.exports = { createPadStore, messageFor, onAccent, SLUG_RE, RESERVED };
