/* ============================================================
   input.js  —  teclado (WASD/setas/Shift) + joystick virtual (touch)
   ============================================================ */
window.FL = window.FL || {};

FL.Input = (function () {
  const keys = Object.create(null);
  const pressed = Object.create(null);   /* teclas "de vez" neste frame */
  const vec = { x: 0, y: 0 };
  let joyActive = false, joyId = null, joyOX = 0, joyOY = 0;
  let joyBase = null, joyKnob = null, joyEl = null;

  const MAP = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right'
  };

  function init() {
    joyEl = document.getElementById('joy');
    joyBase = document.getElementById('joyBase');
    joyKnob = document.getElementById('joyKnob');

    addEventListener('keydown', (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (MAP[e.code] || ['Space', 'ShiftLeft', 'ShiftRight', 'KeyP', 'Escape', 'Enter'].includes(e.code)) e.preventDefault();
      if (!keys[e.code]) pressed[e.code] = true;
      keys[e.code] = true;
    });
    addEventListener('keyup', (e) => { keys[e.code] = false; });
    addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

    /* ---- joystick touch (metade esquerda da tela) ---- */
    joyEl.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      joyId = t.identifier; joyActive = true;
      joyOX = t.clientX; joyOY = t.clientY;
      joyBase.style.left = (joyOX - 60) + 'px';
      joyBase.style.top = (joyOY - 60) + 'px';
      joyBase.style.opacity = '1';
      e.preventDefault();
    }, { passive: false });

    joyEl.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== joyId) continue;
        let dx = t.clientX - joyOX, dy = t.clientY - joyOY;
        const len = Math.hypot(dx, dy), max = 52;
        if (len > max) { dx = dx / len * max; dy = dy / len * max; }
        joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
        e.preventDefault();
      }
    }, { passive: false });

    const endJoy = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== joyId) continue;
        joyId = null; joyActive = false;
        joyKnob.style.transform = 'translate(0,0)';
        joyBase.style.opacity = '0';
      }
    };
    joyEl.addEventListener('touchend', endJoy);
    joyEl.addEventListener('touchcancel', endJoy);
  }

  /* vetor de movimento normalizado */
  function axis() {
    let x = 0, y = 0;
    for (const k in keys) if (MAP[k] && keys[k]) { x += (MAP[k] === 'right' ? 1 : MAP[k] === 'left' ? -1 : 0); y += (MAP[k] === 'down' ? 1 : MAP[k] === 'up' ? -1 : 0); }
    if (joyActive) {
      const tr = joyKnob ? joyKnob.style.transform.match(/-?[\d.]+/g) : null;
      const jx = tr ? parseFloat(tr[0]) : 0, jy = tr ? parseFloat(tr[1]) : 0;
      const l = Math.hypot(jx, jy);
      if (l > 6) { vec.x = jx / 52; vec.y = jy / 52; const n = Math.hypot(vec.x, vec.y); vec.x /= n; vec.y /= n; return vec; }
    }
    const l = Math.hypot(x, y);
    if (l > 0) { x /= l; y /= l; }
    vec.x = x; vec.y = y;
    return vec;
  }

  const down = (code) => !!keys[code];
  const hit = (code) => { const h = !!pressed[code]; pressed[code] = false; return h; };
  function flush() { for (const k in pressed) pressed[k] = false; }

  return { init, axis, down, hit, flush, get joyActive() { return joyActive; } };
})();
