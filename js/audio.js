/* ============================================================
   audio.js  —  bipes simples (WebAudio, sem arquivos externos)
   ============================================================ */
window.FL = window.FL || {};

FL.Audio = (function () {
  let ac = null;

  function ctx() {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }

  function beep(freq, dur = 0.12, type = 'square', vol = 0.12, delay = 0) {
    try {
      const a = ctx();
      const o = a.createOscillator(), g = a.createGain();
      o.type = type;
      o.frequency.value = freq;
      const t0 = a.currentTime + delay;
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(a.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.03);
    } catch (e) { /* som é opcional */ }
  }

  return {
    unlock() { try { ctx(); } catch (e) {} },
    detect() { beep(880, 0.07, 'square', 0.09, 0); beep(1174, 0.09, 'square', 0.09, 0.07); },
    lost()   { beep(520, 0.08, 'square', 0.05, 0); },
    caught() { beep(170, 0.22, 'sawtooth', 0.15, 0); beep(90, 0.42, 'sawtooth', 0.13, 0.13); },
    clear()  { [523, 659, 784].forEach((f, i) => beep(f, 0.13, 'triangle', 0.12, i * 0.09)); },
    win()    { [523, 659, 784, 1046].forEach((f, i) => beep(f, 0.18, 'triangle', 0.13, i * 0.13)); }
  };
})();
