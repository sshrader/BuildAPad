/* Shrinks a chosen picture to a square before it is uploaded: cropped to the middle, 512 px, as PNG when that is small
   enough and as JPEG when it is not. The server checks the result again, so this only keeps uploads quick. */
(function () {
  'use strict';

  const MAX_BYTES = 340000;

  function load(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('not_image')); };
      img.src = url;
    });
  }

  function draw(img, size, background) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    if (background) { g.fillStyle = background; g.fillRect(0, 0, size, size); }
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    g.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    return c;
  }

  const toBlob = (canvas, type, q) => new Promise(resolve => canvas.toBlob(resolve, type, q));

  function toBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1] || '');
      r.onerror = () => reject(new Error('read_failed'));
      r.readAsDataURL(blob);
    });
  }

  // Resolves { base64, dataUrl, type } or rejects with Error('not_image') / Error('too_big').
  async function square(file) {
    if (!file || !/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error('not_image'); // SVG is not accepted
    if (file.size > 12000000) throw new Error('too_big');
    const img = await load(file);
    const tries = [['image/png', 512, undefined, 0], ['image/jpeg', 512, 0.9, '#0a0b0e'], ['image/jpeg', 384, 0.78, '#0a0b0e']];
    for (const t of tries) {
      const blob = await toBlob(draw(img, t[1], t[3] || null), t[0], t[2]);
      if (blob && blob.size <= MAX_BYTES) {
        const base64 = await toBase64(blob);
        return { base64, dataUrl: 'data:' + t[0] + ';base64,' + base64, type: t[0] };
      }
    }
    throw new Error('too_big');
  }

  // Wires a drop zone: click or drop a file, and call onPick with the shrunk picture. Returns nothing.
  function dropzone(zone, input, onPick, onError) {
    const take = async file => {
      try { onPick(await square(file)); } catch (err) { onError(err && err.message === 'too_big' ? 'That picture is too large. Try a smaller one.' : 'Use a PNG, JPG, WebP or GIF picture.'); }
    };
    input.addEventListener('change', () => { if (input.files && input.files[0]) take(input.files[0]); input.value = ''; });
    ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove('over'); }));
    zone.addEventListener('drop', e => { const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) take(f); });
    zone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  }

  window.BapImage = { square, dropzone };
})();
