// Which Solana network this server is on. Pages read it from /api/launch/config, so links and wording
// follow the server's setting. Until it loads, it assumes devnet (the safe, play-money default).
(function () {
  const net = {
    cluster: 'devnet',
    main: false,
    name: 'devnet',
    suffix: '?cluster=devnet',
    // dial.to needs the cluster for devnet only.
    dialSuffix: '&cluster=devnet',
    apply: function (cluster) {
      net.cluster = cluster === 'mainnet-beta' ? 'mainnet-beta' : 'devnet';
      net.main = net.cluster === 'mainnet-beta';
      net.name = net.main ? 'Solana' : 'devnet';
      net.suffix = net.main ? '' : '?cluster=devnet';
      net.dialSuffix = net.main ? '' : '&cluster=devnet';
      try {
        document.querySelectorAll('[data-net="name"]').forEach(function (el) { el.textContent = net.name; });
        document.querySelectorAll('[data-net-only]').forEach(function (el) { el.hidden = el.getAttribute('data-net-only') !== net.cluster; });
      } catch (e) { /* page without these */ }
    }
  };
  net.ready = fetch('/api/launch/config', { headers: { Accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : {}; })
    .then(function (c) { net.apply(c && c.cluster); return net; })
    .catch(function () { net.apply('devnet'); return net; });
  // The server puts the pad's name and wording in window.PAD. This is only a fallback for a bare static page.
  if (!window.PAD) window.PAD = { id: 'hatchpad', name: 'HatchPad', subject: 'animal', aSubject: 'an animal', subjects: 'animals', ideas: { moods: null, things: null, extras: null } };
  if (!window.PAD.platform) window.PAD.platform = window.PAD.name;
  // "65% creator, 15% pad owner, 20% BuildAPad", read from a coin's real on-chain split when the server sends it.
  window.feeLine = function (info) {
    const p = window.PAD.platform;
    if (!info || !info.shares || !info.shares.length) return info ? info.creatorPct + '% creator, ' + info.platformPct + '% ' + p : '';
    let seenCreator = false;
    return info.shares.map(s => {
      if (s.address === info.platformWallet) return s.pct + '% ' + p;
      if (!seenCreator) { seenCreator = true; return s.pct + '% creator'; }
      return s.pct + '% pad owner';
    }).join(', ');
  };
  window.AnimalNet = net;

  // SOL price chip in the header, refreshed every minute. It stays hidden if the price cannot be read.
  function startTicker() {
    const row = document.querySelector('.top .row');
    if (!row) return;
    const chip = document.createElement('span');
    chip.className = 'chip-price'; chip.hidden = true;
    chip.title = 'Solana price in US dollars';
    const dot = document.createElement('i'); dot.setAttribute('aria-hidden', 'true');
    const txt = document.createElement('span');
    chip.appendChild(dot); chip.appendChild(txt);
    row.insertBefore(chip, row.firstChild);
    function pull() {
      fetch('/api/price', { headers: { Accept: 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (b) {
          if (!b || !Number.isFinite(b.usd)) return;
          txt.textContent = 'SOL $' + b.usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          chip.hidden = false;
        })
        .catch(function () { /* keep the last price, or stay hidden */ });
    }
    pull();
    setInterval(pull, 60000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startTicker); else startTicker();
})();
