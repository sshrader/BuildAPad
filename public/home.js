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
      const owner = Math.min(20, c.maxOwnerPct || 0), launcher = 100 - c.platformPct - owner;
      $('fb-l').style.width = launcher + '%'; $('fb-o').style.width = owner + '%'; $('fb-p').style.width = c.platformPct + '%';
      $('fk-l').textContent = launcher + '%'; $('fk-o').textContent = owner + '%'; $('fk-p').textContent = c.platformPct + '%';
      $('fees-note').textContent = 'Shown with an example ' + owner + '% owner share. You can choose anything from 0% up to ' + c.maxOwnerPct + '%.';
    })
    .catch(() => { /* the example stays as written */ });
})();
