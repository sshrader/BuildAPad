/* A built pad's page: its logo and fee split, and the coin form. A picture is uploaded with the coin's details, and the
   result is handed to launch.js (the wallet steps) as a "staged" coin. */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const PAD = window.PAD, ex = PAD.extra || {};
  let pic = null;
  let busy = false;

  // Header logo and the preview's first letter
  if (ex.logoUrl) { const img = $('pad-logo'); img.src = ex.logoUrl; img.hidden = false; img.addEventListener('error', () => { img.hidden = true; }); }
  $('brand').setAttribute('href', '/p/' + (ex.slug || ''));
  $('built-with').textContent = PAD.platform || 'BuildAPad';

  // The fee split, from the server's real numbers
  fetch('/api/launch/config', { headers: { Accept: 'application/json' } }).then(r => r.json()).then(info => {
    const platform = info && Number.isFinite(info.platformPct) ? info.platformPct : 10;
    const owner = ex.ownerPct > 0 ? Math.min(ex.ownerPct, 50 - platform) : 0;
    const launcher = 100 - platform - owner;
    $('fb-l').style.width = launcher + '%'; $('fb-o').style.width = owner + '%'; $('fb-p').style.width = platform + '%';
    $('fk-l').textContent = launcher + '%'; $('fk-o').textContent = owner + '%'; $('fk-p').textContent = platform + '%';
    $('fk-pname').firstChild.textContent = (PAD.platform || 'Platform') + ' ';
  }).catch(() => { /* the bar stays empty */ });

  function say(text, bad) { const el = $('c-status'); el.textContent = text; el.className = 'status' + (bad ? ' bad' : ''); }

  function paint() {
    const name = $('c-name').value.trim(), sym = $('c-sym').value.trim().toUpperCase();
    $('cp-name').textContent = name || 'Your coin';
    $('cp-sym').textContent = sym || 'TICKER';
    $('cp-letter').textContent = (name || '?').charAt(0).toUpperCase();
    $('cp-letter').hidden = Boolean(pic);
    $('cp-img').hidden = !pic;
    if (pic) $('cp-img').src = pic.dataUrl;
  }

  // Changing anything after a coin was staged means it must be saved again, so the launch panel steps back.
  function unstage() {
    $('launch').hidden = true;
    document.dispatchEvent(new CustomEvent('animalpad:reset'));
  }
  ['c-name', 'c-sym', 'c-desc'].forEach(id => $(id).addEventListener('input', () => {
    if (id === 'c-sym') $('c-sym').value = $('c-sym').value.replace(/[^A-Za-z0-9$]/g, '').replace(/^\$/, '').toUpperCase();
    paint(); unstage();
  }));

  window.BapImage.dropzone($('c-drop'), $('c-file'), p => {
    pic = p;
    $('c-drop-img').src = p.dataUrl; $('c-drop-img').hidden = false; $('c-drop-empty').hidden = true;
    say(''); paint(); unstage();
  }, msg => say(msg, true));

  const WHY = {
    bad_request: 'Check the name and ticker. The ticker is 1 to 10 letters or numbers.',
    blocked_name: 'That name or description is not allowed. Names that copy a real person, brand or project are blocked.',
    bad_image: 'That picture could not be used. Try a PNG or JPG.',
    rate_limited: 'Too many uploads. Wait a few minutes.'
  };

  $('coinform').addEventListener('submit', async e => {
    e.preventDefault();
    if (busy) return;
    const name = $('c-name').value.trim(), ticker = $('c-sym').value.trim().toUpperCase();
    if (!name) { say('Give your coin a name.', true); return; }
    if (!/^[A-Z0-9]{1,10}$/.test(ticker)) { say(WHY.bad_request, true); return; }
    if (!pic) { say('Add a logo for your coin.', true); return; }
    busy = true; $('c-go').disabled = true; say('Saving…');
    try {
      const res = await fetch('/api/art/upload', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: pic.base64, name: name, ticker: ticker, description: $('c-desc').value.trim() })
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body || !body.id) { say(WHY[body && body.error] || 'Could not save the coin. Try again.', true); }
      else {
        say('Saved. Next: connect your wallet and launch.');
        $('launch').hidden = false;
        document.dispatchEvent(new CustomEvent('animalpad:staged', { detail: { name: body.name, symbol: body.ticker, art: body.id } }));
        $('launch').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    } catch (err) { say('Could not reach the server. Try again.', true); }
    busy = false; $('c-go').disabled = false;
  });

  paint();
})();
