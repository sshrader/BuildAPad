/* Home page: the list of pads built here, and the fee split example from the server's real numbers. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);

  function card(p) {
    const a = document.createElement('a');
    a.className = 'padcard'; a.href = '/p/' + encodeURIComponent(p.slug);
    a.style.setProperty('--pc', /^#[0-9a-f]{6}$/i.test(p.accent) ? p.accent : '#ff8f3d');
    const logo = document.createElement('div'); logo.className = 'mock-logo';
    const img = document.createElement('img'); img.alt = ''; img.src = p.logoUrl; img.width = 40; img.height = 40;
    img.addEventListener('error', () => { logo.textContent = (p.name || '?').charAt(0).toUpperCase(); img.remove(); });
    logo.appendChild(img);
    const b = document.createElement('b'); b.textContent = p.name;
    const s = document.createElement('span'); s.textContent = p.tagline || 'A launchpad on Solana';
    a.appendChild(logo); a.appendChild(b); a.appendChild(s);
    return a;
  }

  // ----- Hero: the sample pad changes look every few seconds, then stops if the visitor prefers less motion.
  const SAMPLES = [
    { n: 'Northwind', t: 'Fresh coins, fair fees.', c: '#5b8cff', f: '#ffffff', o: 20, u: 'northwind' },
    { n: 'Ember', t: 'Hot launches only.', c: '#ff8f3d', f: '#140a02', o: 15, u: 'ember' },
    { n: 'Verdant', t: 'Grow something new.', c: '#22c55e', f: '#04140a', o: 25, u: 'verdant' },
    { n: 'Orchid', t: 'Soft launch, loud results.', c: '#ec4899', f: '#ffffff', o: 10, u: 'orchid' }
  ];
  let si = 0;
  function showSample(s) {
    const m = $('mock'); if (!m) return;
    m.style.setProperty('--accent', s.c); m.style.setProperty('--on-accent', s.f);
    $('glow').style.setProperty('--glow', s.c);
    $('mock-name').textContent = s.n; $('mock-tag').textContent = s.t; $('mock-logo').textContent = s.n.charAt(0); $('mock-url').textContent = '/p/' + s.u;
    const platform = window.__platformPct || 10, launcher = 100 - platform - s.o;
    $('mk-l').style.width = launcher + '%'; $('mk-o').style.width = s.o + '%'; $('mk-lt').textContent = launcher + '%'; $('mk-ot').textContent = s.o + '%';
  }
  showSample(SAMPLES[0]);
  let reduce = false;
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* default */ }
  if (!reduce) setInterval(() => { si = (si + 1) % SAMPLES.length; showSample(SAMPLES[si]); }, 3600);

  // ----- Leaderboard and live totals
  const fmt = n => (Math.round(n * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });
  function count(el, to) {
    if (!el) return;
    if (reduce || !to) { el.textContent = fmt(to); return; }
    const t0 = performance.now(), dur = 900;
    (function step(t) { const k = Math.min(1, (t - t0) / dur); el.textContent = fmt(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); })(t0);
  }
  function row(p, i) {
    const li = document.createElement('li'); li.className = 'brow'; if (i === 0) li.classList.add('first');
    li.style.setProperty('--pc', /^#[0-9a-f]{6}$/i.test(p.accent) ? p.accent : '#ff8f3d');
    const rank = document.createElement('span'); rank.className = 'brank'; rank.textContent = String(i + 1);
    const a = document.createElement('a'); a.className = 'bpad'; a.href = '/p/' + encodeURIComponent(p.slug);
    const logo = document.createElement('div'); logo.className = 'mock-logo';
    const img = document.createElement('img'); img.alt = ''; img.src = p.logoUrl; img.width = 40; img.height = 40;
    img.addEventListener('error', () => { logo.textContent = (p.name || '?').charAt(0).toUpperCase(); img.remove(); });
    logo.appendChild(img);
    const nm = document.createElement('span'); nm.className = 'bname';
    const b = document.createElement('b'); b.textContent = p.name;
    const sm = document.createElement('small'); sm.textContent = '/p/' + p.slug;
    nm.appendChild(b); nm.appendChild(sm);
    a.appendChild(logo); a.appendChild(nm);
    const nums = document.createElement('span'); nums.className = 'bnums';
    [[p.coins, p.coins === 1 ? 'coin' : 'coins'], [fmt(p.raisedSol), 'SOL raised'], [p.graduated, 'graduated']].forEach(x => {
      const d = document.createElement('span'); const v = document.createElement('b'); v.textContent = String(x[0]); d.appendChild(v); d.appendChild(document.createTextNode(' ' + x[1])); nums.appendChild(d);
    });
    const top = document.createElement('span'); top.className = 'btop';
    (p.top || []).forEach(c => {
      const t = document.createElement('a'); t.className = 'tchip'; t.href = '/coin/' + encodeURIComponent(c.pool); t.title = c.name;
      if (c.imageUrl) { const im = document.createElement('img'); im.alt = ''; im.src = c.imageUrl; im.width = 18; im.height = 18; t.appendChild(im); }
      t.appendChild(document.createTextNode(c.symbol)); top.appendChild(t);
    });
    li.appendChild(rank); li.appendChild(a); li.appendChild(nums); li.appendChild(top);
    return li;
  }
  // The official coin, once the admin has launched it.
  fetch('/api/founder', { headers: { Accept: 'application/json' } })
    .then(r => (r.ok ? r.json() : null))
    .then(f => {
      if (!f || !f.launched) return;
      $('of-img').src = f.imageUrl; $('of-name').textContent = f.launched.name; $('of-sym').textContent = '$' + f.launched.symbol;
      $('of-ca').textContent = f.launched.mint; $('of-open').setAttribute('href', '/coin/' + encodeURIComponent(f.launched.pool));
      $('official').hidden = false;
    })
    .catch(() => { /* no official coin to show */ });

  fetch('/api/leaderboard', { headers: { Accept: 'application/json' } })
    .then(r => (r.ok ? r.json() : null))
    .then(j => {
      if (!j) throw new Error('no board');
      const box = $('boardlist'); box.textContent = '';
      (j.pads || []).forEach((p, i) => box.appendChild(row(p, i)));
      $('board-note').textContent = (j.pads || []).length ? '' : 'No coins launched yet. The first pad to launch a coin takes the top spot.';
      count($('st-pads'), j.stats.pads); count($('st-coins'), j.stats.coins); count($('st-sol'), j.stats.raisedSol);
    })
    .catch(() => { $('board-note').textContent = 'Could not load the leaderboard. Try again in a moment.'; });

  fetch('/api/pads', { headers: { Accept: 'application/json' } })
    .then(r => (r.ok ? r.json() : null))
    .then(j => {
      const list = (j && j.pads) || [];
      const box = $('padcards');
      list.forEach(p => box.appendChild(card(p)));
      $('pads-note').textContent = list.length ? '' : 'No pads yet. Yours could be the first.';
    })
    .catch(() => { $('pads-note').textContent = 'Could not load the pads. Try again in a moment.'; });

  fetch('/api/builder/config', { headers: { Accept: 'application/json' } })
    .then(r => (r.ok ? r.json() : null))
    .then(c => {
      if (!c || !Number.isFinite(c.platformPct)) return;
      window.__platformPct = c.platformPct; showSample(SAMPLES[si]);
      const owner = Math.min(20, c.maxOwnerPct || 0), launcher = 100 - c.platformPct - owner;
      $('fb-l').style.width = launcher + '%'; $('fb-o').style.width = owner + '%'; $('fb-p').style.width = c.platformPct + '%';
      $('fk-l').textContent = launcher + '%'; $('fk-o').textContent = owner + '%'; $('fk-p').textContent = c.platformPct + '%';
      $('fees-note').textContent = 'Shown with an example ' + owner + '% owner share. You can choose anything from 0% up to ' + c.maxOwnerPct + '%.';
    })
    .catch(() => { /* the example stays as written */ });
})();
