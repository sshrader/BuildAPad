'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createPadStore, messageFor } = require('../padstore.js');
const { verifySignature } = require('../sigverify.js');
const { createApp } = require('../server.js');
const { createArt } = require('../art.js');

const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58(buf) {
  let n = BigInt('0x' + buf.toString('hex')), s = '';
  while (n > 0n) { s = A[Number(n % 58n)] + s; n /= 58n; }
  for (const b of buf) { if (b === 0) s = '1' + s; else break; }
  return s;
}
function wallet() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const address = b58(publicKey.export({ format: 'der', type: 'spki' }).subarray(12));
  return { address, sign: msg => crypto.sign(null, Buffer.from(msg), privateKey).toString('base64') };
}
const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), crypto.randomBytes(300)]);
const quiet = { log() {}, error() {} };

function form(w, over, now) {
  const f = Object.assign({ slug: 'neon-desk', name: 'Neon Desk', tagline: 'Fresh coins daily', accent: '#5b8cff', corners: 'round', ownerPct: 15, ownerWallet: w.address, links: {}, logo: png().toString('base64'), ts: now }, over);
  f.signature = w.sign(messageFor(f));
  return f;
}

test('signatures: only the wallet that signed the exact message passes', () => {
  const w = wallet(), other = wallet();
  const sig = w.sign('hello');
  assert.equal(verifySignature(w.address, 'hello', sig), true);
  assert.equal(verifySignature(w.address, 'hello!', sig), false);
  assert.equal(verifySignature(other.address, 'hello', sig), false);
  assert.equal(verifySignature(w.address, 'hello', 'not-a-signature'), false);
  assert.equal(verifySignature('nope', 'hello', sig), false);
});

test('a pad is created from a signed form and read back', () => {
  let t = 1000000;
  const store = createPadStore({ now: () => t, logger: quiet, platformPct: 10 });
  assert.equal(store.maxOwnerPct, 40);
  const w = wallet();
  const r = store.create(form(w, {}, t), { ip: '1.1.1.1' });
  assert.equal(r.status, 201);
  assert.equal(r.body.pad.slug, 'neon-desk');
  assert.equal(store.get('neon-desk').ownerPct, 15);
  assert.equal(store.list().length, 1);
  assert.ok(store.logo('neon-desk').buf.length > 100);
  const pad = store.toPad('neon-desk');
  assert.equal(pad.name, 'Neon Desk');
  assert.equal(pad.theme.dark.accent, '#5b8cff');
  assert.equal(pad.extra.ownerWallet, w.address);
});

test('creation is refused for bad input, bad or old signatures, taken names and too many pads', () => {
  let t = 5000000;
  const store = createPadStore({ now: () => t, logger: quiet, platformPct: 10, perIpPerHour: 100 });
  const w = wallet();
  const ip = { ip: '2.2.2.2' };
  const code = (over, who) => store.create(form(who || w, over, t), ip);
  assert.equal(code({ slug: 'A' }).body.error, 'bad_slug');
  assert.equal(code({ slug: 'admin' }).body.error, 'slug_reserved');
  assert.equal(code({ name: 'x' }).body.error, 'bad_name');
  assert.equal(code({ accent: 'red' }).body.error, 'bad_color');
  assert.equal(code({ ownerPct: 41 }).body.error, 'bad_fee_share');
  assert.equal(code({ ownerPct: 1.5 }).body.error, 'bad_fee_share');
  assert.equal(code({ logo: 'AAAA' }).body.error, 'bad_logo');
  assert.equal(code({ links: { twitter: 'https://evil.example/x' } }).body.error, 'bad_links');
  // a signature by another wallet, or over different words, is refused
  const forged = form(w, {}, t); forged.signature = wallet().sign(messageFor(forged));
  assert.equal(store.create(forged, ip).body.error, 'bad_signature');
  const tampered = form(w, {}, t); tampered.ownerPct = 5;
  assert.equal(store.create(tampered, ip).body.error, 'bad_signature');
  // a signature that is too old
  const old = form(w, {}, t - 11 * 60000);
  assert.equal(store.create(old, ip).body.error, 'stale_signature');
  assert.equal(store.size(), 0);
  assert.equal(code({}).status, 201);
  assert.equal(code({}).body.error, 'slug_taken');
  assert.equal(code({ slug: 'two' }).status, 201);
  assert.equal(code({ slug: 'three' }).status, 201);
  assert.equal(code({ slug: 'four' }).body.error, 'too_many_pads');
});

test('pads and logos survive a restart when there is a data folder', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'padstore-'));
  const t = Date.now();
  const opts = { file: path.join(dir, 'p.json'), logoDir: path.join(dir, 'logos'), logger: quiet, platformPct: 10 };
  const a = createPadStore(opts);
  assert.equal(a.create(form(wallet(), {}, t), { ip: 'x' }).status, 201);
  const b = createPadStore(opts);
  assert.equal(b.get('neon-desk').name, 'Neon Desk');
  assert.ok(b.logo('neon-desk').buf.length > 100);
});

const http = require('node:http');
const call = (port, method, p, body) => new Promise((resolve, reject) => {
  const data = body === undefined ? null : JSON.stringify(body);
  const req = http.request({ host: '127.0.0.1', port, path: p, method, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} }, res => {
    const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], raw: Buffer.concat(chunks) }));
  });
  req.on('error', reject); if (data) req.write(data); req.end();
});

test('server: build a pad over the API, then its page, logo and list are served; the pad page is only at /p/<name>', async () => {
  const store = createPadStore({ logger: quiet, platformPct: 10 });
  const srv = createApp({ art: createArt({}), padStore: store });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  try {
    const cfg = JSON.parse((await call(port, 'GET', '/api/builder/config')).raw);
    assert.equal(cfg.maxOwnerPct, 40);
    const w = wallet();
    const made = await call(port, 'POST', '/api/pads', form(w, {}, Date.now()));
    assert.equal(made.status, 201);
    const page = await call(port, 'GET', '/p/neon-desk');
    assert.equal(page.status, 200);
    const html = page.raw.toString('utf8');
    assert.ok(html.includes('<title>Neon Desk</title>'));
    assert.ok(html.includes('--accent:#5b8cff'));
    assert.ok(html.includes('"ownerWallet":"' + w.address + '"'));
    assert.ok(!html.includes('{{'));
    const logo = await call(port, 'GET', '/pad-logo/neon-desk.png');
    assert.equal(logo.status, 200); assert.equal(logo.type, 'image/png');
    assert.equal((await call(port, 'GET', '/pad-logo/neon-desk.jpg')).status, 404);
    assert.equal((await call(port, 'GET', '/p/nope-nope')).status, 404);
    assert.equal((await call(port, 'GET', '/pad.html')).status, 404);
    assert.equal(JSON.parse((await call(port, 'GET', '/api/pads')).raw).pads.length, 1);
    assert.equal(JSON.parse((await call(port, 'GET', '/api/pads/neon-desk')).raw).pad.name, 'Neon Desk');
    // the upload route keeps a launcher's picture only if it really is one
    const up = await call(port, 'POST', '/api/art/upload', { image: png().toString('base64'), name: 'Cool Coin', ticker: '$cool', description: 'hi' });
    assert.equal(up.status, 200);
    const j = JSON.parse(up.raw);
    assert.equal(j.ticker, 'COOL');
    assert.equal((await call(port, 'GET', j.imageUrl)).status, 200);
    assert.equal((await call(port, 'POST', '/api/art/upload', { image: Buffer.from('<svg/>').toString('base64'), name: 'Cool', ticker: 'COOL' })).status, 400);
  } finally { await new Promise(r => srv.close(r)); }
});
