/* ============================================================
   main.js  —  boot, telas (menu/pausa/fases), HUD e loop principal
   ============================================================ */
window.FL = window.FL || {};

FL.Main = (function () {
  const U = FL.U;
  const TOTAL = FL.Levels.LEVELS.length;
  const TIME_LIMIT = 120;      /* segundos para escapar das 5 fases */

  let canvas, ctx;
  let W = 0, H = 0, dpr = 1;
  let game = null;
  let state = 'menu';          /* menu | playing | paused | dead | clear | won */
  let levelIndex = 0;
  let runTime = 0, levelTime = 0;
  let last = 0;
  let bannerTimer = 0;

  const $ = (id) => document.getElementById(id);
  const el = {};

  function init() {
    canvas = $('game');
    ctx = canvas.getContext('2d');

    ['hud', 'menu', 'pause', 'levelclear', 'gameover', 'victory',
     'levelInfo', 'timer', 'stateInfo', 'banner', 'hint',
     'btnPlay', 'btnPause', 'btnResume', 'btnQuit', 'btnNext',
     'btnRetry', 'btnMenuOver', 'btnMenuWin',
     'pauseStats', 'clearTitle', 'clearSub', 'clearStats', 'winStats',
     'joy', 'joyBase', 'joyKnob', 'overTitle', 'overSub'].forEach((id) => { el[id] = $(id); });

    resize();
    addEventListener('resize', resize);
    addEventListener('keydown', () => FL.Audio.unlock(), { once: true });
    addEventListener('pointerdown', () => FL.Audio.unlock(), { once: true });

    FL.Input.init();

    el.btnPlay.addEventListener('click', startRun);
    el.btnPause.addEventListener('click', togglePause);
    el.btnResume.addEventListener('click', togglePause);
    el.btnQuit.addEventListener('click', toMenu);
    el.btnNext.addEventListener('click', nextLevel);
    el.btnRetry.addEventListener('click', retry);
    el.btnMenuOver.addEventListener('click', toMenu);
    el.btnMenuWin.addEventListener('click', toMenu);

    /* labirinto da fase 1 como fundo do menu */
    game = new FL.Game(0);
    layoutGame();

    requestAnimationFrame(loop);
  }

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layoutGame();
  }

  function layoutGame() {
    if (!game) return;
    const availH = H - 96;                       /* HUD topo + dica embaixo */
    const ts = Math.floor(Math.min((W - 20) / game.cols, availH / game.rows));
    game.ts = Math.max(16, ts);
    game.ox = Math.floor((W - game.cols * game.ts) / 2);
    game.oy = Math.floor(58 + (availH - game.rows * game.ts) / 2);
  }

  function loop(t) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (t - last) / 1000 || 0);
    last = t;

    if (state === 'playing' && game && !game.over) {
      game.update(dt);
      levelTime += dt;
      runTime += dt;
      updateHUD();
      if (runTime >= TIME_LIMIT) { timeUp(); }
      else if (bannerTimer > 0) {
        bannerTimer -= dt;
        if (bannerTimer <= 0) el.banner.classList.add('hidden');
      }
    }
    if (game) game.draw(ctx);
  }

  /* ---------- telas ---------- */
  function show(id) { el[id].classList.remove('hidden'); }
  function hide(id) { el[id].classList.add('hidden'); }

  function startRun() {
    FL.Audio.unlock();
    levelIndex = 0;
    runTime = 0;
    loadLevel(levelIndex);
    state = 'playing';
    hide('menu');
    hide('gameover');
    show('hud');
    showBanner(`FASE 1 — chegue no portal`, 2);
  }

  function loadLevel(i) {
    game = new FL.Game(i);
    game.onCaught = onCaught;
    game.onClear = onClear;
    layoutGame();
    levelTime = 0;
    updateHUD();
    showBanner(`FASE ${i + 1} de ${TOTAL}`, 1.6);
  }

  function onCaught() {
    state = 'dead';
    FL.Audio.caught();
    updateHUD();
    el.overTitle.textContent = 'VOCÊ FOI PEGO';
    el.overSub.textContent = 'Um guarda te alcançou no labirinto.';
    show('gameover');
  }

  /* acabou o tempo: reinicia a corrida inteira no "tentar de novo" */
  function timeUp() {
    if (state !== 'playing') return;
    state = 'dead';
    FL.Audio.caught();
    updateHUD();
    el.overTitle.textContent = 'O TEMPO ACABOU';
    el.overSub.textContent = `Os 2 minutos se esgotaram — você escapeu de ${levelIndex + 1} de ${TOTAL} fases.`;
    show('gameover');
  }

  const timeLeft = () => Math.max(0, TIME_LIMIT - runTime);

  function onClear() {
    if (levelIndex >= TOTAL - 1) {
      state = 'won';
      FL.Audio.win();
      el.winStats.innerHTML =
        statRow('Tempo total', U.fmtTime(runTime)) +
        statRow('Tempo restante', U.fmtTime(timeLeft())) +
        statRow('Fases', `${TOTAL}/${TOTAL}`);
      show('victory');
    } else {
      state = 'clear';
      FL.Audio.clear();
      el.clearTitle.textContent = `FASE ${levelIndex + 1} COMPLETA`;
      el.clearSub.textContent = 'Chegou ao portal sem ser alcançado.';
      el.clearStats.innerHTML =
        statRow('Tempo na fase', U.fmtTime(levelTime)) +
        statRow('Tempo total', U.fmtTime(runTime)) +
        statRow('Tempo restante', U.fmtTime(timeLeft())) +
        statRow('Progresso', `${levelIndex + 1}/${TOTAL} fases`);
      show('levelclear');
    }
  }

  function nextLevel() {
    levelIndex++;
    loadLevel(levelIndex);
    state = 'playing';
    hide('levelclear');
  }

  function retry() {
    if (runTime >= TIME_LIMIT) {          /* tempo esgotado: começa tudo de novo */
      startRun();
      return;
    }
    loadLevel(levelIndex);
    state = 'playing';
    hide('gameover');
  }

  function togglePause() {
    if (state === 'playing') {
      state = 'paused';
      el.pauseStats.innerHTML =
        statRow('Fase', `${levelIndex + 1}/${TOTAL}`) +
        statRow('Tempo na fase', U.fmtTime(levelTime)) +
        statRow('Tempo restante', U.fmtTime(timeLeft()));
      show('pause');
    } else if (state === 'paused') {
      state = 'playing';
      hide('pause');
    }
  }

  function toMenu() {
    state = 'menu';
    runTime = 0;
    levelTime = 0;
    hide('pause'); hide('gameover'); hide('levelclear'); hide('victory'); hide('hud');
    game = new FL.Game(0);
    layoutGame();
    show('menu');
  }

  function statRow(label, value) {
    return `<div class="row"><span>${label}</span><b>${value}</b></div>`;
  }

  function showBanner(text, dur) {
    el.banner.textContent = text;
    el.banner.classList.remove('hidden');
    bannerTimer = dur;
  }

  function updateHUD() {
    if (!game) return;
    el.levelInfo.textContent = `FASE ${levelIndex + 1} / ${TOTAL}`;
    const left = timeLeft();
    el.timer.textContent = U.fmtTime(left);
    el.timer.classList.toggle('low', left <= 20);

    const s = el.stateInfo;
    s.classList.remove('stealth', 'suspicious', 'hunted');
    if (state === 'dead') {
      s.classList.add('hunted');
      s.textContent = 'PEGO';
    } else if (game.status === 'hunted') {
      s.classList.add('hunted');
      s.textContent = 'DETECTADO';
    } else if (game.status === 'suspicious') {
      s.classList.add('suspicious');
      s.textContent = 'SUSPEITO';
    } else {
      s.classList.add('stealth');
      s.textContent = game.player.sneak ? 'FURTIVO · SILENCIOSO' : 'FURTIVO';
    }
  }

  /* pausa pelo teclado (checada no loop para usar o "hit" de input) */
  setInterval(() => {
    if (FL.Input.hit('KeyP') && (state === 'playing' || state === 'paused')) togglePause();
    FL.Input.flush();
  }, 16);

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => FL.Main.init());
