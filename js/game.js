/* ============================================================
   game.js  —  lógica da fase: jogador, guardas, colisão,
   campo de visão, partículas e desenho
   ------------------------------------------------------------
   posições são em TILES (números fracionários); velocidade em
   tiles por segundo. O tamanho do tile (ts) só entra no desenho.
   ============================================================ */
window.FL = window.FL || {};

const U = FL.U;

FL.Game = function (levelIndex) {
  const L = FL.Levels.generate(levelIndex);

  this.levelIndex = levelIndex;
  this.cfg = L.cfg;
  this.grid = L.grid;
  this.cols = L.cols;
  this.rows = L.rows;

  this.exit = { x: L.exit.x + 0.5, y: L.exit.y + 0.5 };

  this.player = {
    x: L.spawn.x + 0.5,
    y: L.spawn.y + 0.5,
    hw: 0.30, hh: 0.30,
    dx: 1, dy: 0,
    sneak: false,
    speed: 4.4
  };

  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  this.enemies = L.enemies.map((c) => {
    const d = DIRS.find((v) => !this.blockedAt(c.x + 0.5 + v[0] * 0.9, c.y + 0.5 + v[1] * 0.9)) || [1, 0];
    return {
      x: c.x + 0.5,
      y: c.y + 0.5,
      r: 0.34,
      hw: 0.34, hh: 0.34,
      dx: d[0], dy: d[1],
      state: 'patrol',          /* patrol | chase | search | look */
      loseT: 0, lookT: 0, turnT: 0,
      lx: 0, ly: 0
    };
  });

  this.status = 'stealth';
  this.time = 0;
  this.over = false;
  this.ts = 40;                /* definido por layout() */
  this.ox = 0; this.oy = 0;

  this.parts = [];             /* partículas */
  this.rings = [];             /* ondas de choque */
  this.shakeT = 0;

  this.onCaught = null;
  this.onClear = null;
};

/* ---------- grade ---------- */
FL.Game.prototype.solidAt = function (tx, ty) {
  if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return true;
  return this.grid[ty][tx] === 1;
};
FL.Game.prototype.blockedAt = function (px, py) {   /* px/py em tiles */
  return this.solidAt(Math.floor(px), Math.floor(py));
};

/* movimento com colisão e deslize nos eixos (entidade AABB em tiles) */
FL.Game.prototype.moveEnt = function (e, dx, dy) {
  e.x += dx;
  let hw = e.hw, hh = e.hh;
  let x0 = Math.floor(e.x - hw), x1 = Math.floor(e.x + hw);
  let y0 = Math.floor(e.y - hh), y1 = Math.floor(e.y + hh);
  if (dx > 0) {
    for (let ty = y0; ty <= y1; ty++) if (this.solidAt(x1, ty)) { e.x = Math.min(e.x, x1 - hw - 0.001); break; }
  } else if (dx < 0) {
    for (let ty = y0; ty <= y1; ty++) if (this.solidAt(x0, ty)) { e.x = Math.max(e.x, x0 + 1 + hw + 0.001); break; }
  }
  e.y += dy;
  x0 = Math.floor(e.x - hw); x1 = Math.floor(e.x + hw);
  y0 = Math.floor(e.y - hh); y1 = Math.floor(e.y + hh);
  if (dy > 0) {
    for (let tx = x0; tx <= x1; tx++) if (this.solidAt(tx, y1)) { e.y = Math.min(e.y, y1 - hh - 0.001); break; }
  } else if (dy < 0) {
    for (let tx = x0; tx <= x1; tx++) if (this.solidAt(tx, y0)) { e.y = Math.max(e.y, y0 + 1 + hh + 0.001); break; }
  }
};

/* distância (tiles) até a primeira parede na direção (dx,dy);
   devolve maxDist se o caminho estiver livre. Varre a grade (DDA). */
FL.Game.prototype.rayHit = function (x0, y0, dx, dy, maxDist) {
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return maxDist;
  dx /= len; dy /= len;

  let tx = Math.floor(x0), ty = Math.floor(y0);
  if (this.solidAt(tx, ty)) return 0;

  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
  const dDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;   /* >= 1 por passo */
  const dDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  let dMaxX = dx !== 0 ? (dx > 0 ? (tx + 1 - x0) : (x0 - tx)) * dDeltaX : Infinity;
  let dMaxY = dy !== 0 ? (dy > 0 ? (ty + 1 - y0) : (y0 - ty)) * dDeltaY : Infinity;

  for (;;) {
    let t;                                    /* distância da fronteira cruzada */
    if (dMaxX < dMaxY) { t = dMaxX; tx += stepX; dMaxX += dDeltaX; }
    else                { t = dMaxY; ty += stepY; dMaxY += dDeltaY; }
    if (t > maxDist) return maxDist;          /* caminho livre até o alcance */
    if (this.solidAt(tx, ty)) return t;       /* bateu na parede mais próxima */
  }
};

/* linha de visão entre dois pontos (tiles): nenhuma parede no caminho */
FL.Game.prototype.los = function (x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return true;
  return this.rayHit(x0, y0, dx, dy, d) >= d - 1e-4;
};

FL.Game.prototype.burst = function (x, y, n, color, spd) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = (0.3 + Math.random()) * spd;
    this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.4, max: 0.9, color, size: 0.05 + Math.random() * 0.06 });
  }
};

FL.Game.prototype.ring = function (x, y, color, maxR) {
  this.rings.push({ x, y, r: 0.1, maxR, life: 0.55, color });
};

FL.Game.prototype.layout = function (ts) {
  this.ts = ts;
  this.ox = (this.cols * ts - this.cols * ts) / 2;
  this.oy = 0;
};

/* ---------- atualização ---------- */
FL.Game.prototype.update = function (dt) {
  if (this.over) return;
  this.time += dt;

  const p = this.player;
  const I = FL.Input;
  const v = I.axis();

  p.sneak = I.down('ShiftLeft') || I.down('ShiftRight');
  const spd = p.speed * (p.sneak ? 0.5 : 1);

  if (v.x || v.y) {
    p.dx = v.x; p.dy = v.y;
    this.moveEnt(p, v.x * spd * dt, v.y * spd * dt);
  }

  /* guardas */
  for (const e of this.enemies) this.updateEnemy(e, dt);

  /* pego? */
  for (const e of this.enemies) {
    if (U.dist(p.x, p.y, e.x, e.y) < p.hw + e.r - 0.04) { this.caught(); return; }
  }

  /* estado global (HUD) */
  if (this.enemies.some((e) => e.state === 'chase')) this.status = 'hunted';
  else if (this.enemies.some((e) => e.state === 'search')) this.status = 'suspicious';
  else this.status = 'stealth';

  /* partículas / ondas / tremor */
  for (const q of this.parts) { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.96; q.vy *= 0.96; q.life -= dt; }
  for (let i = this.parts.length - 1; i >= 0; i--) if (this.parts[i].life <= 0) this.parts.splice(i, 1);
  for (const r of this.rings) { r.r += (r.maxR / 0.55) * dt; r.life -= dt; }
  for (let i = this.rings.length - 1; i >= 0; i--) if (this.rings[i].life <= 0) this.rings.splice(i, 1);
  this.shakeT = Math.max(0, this.shakeT - dt);

  /* chegou na saída? */
  if (U.dist(p.x, p.y, this.exit.x, this.exit.y) < 0.45) {
    this.over = true;
    this.burst(this.exit.x, this.exit.y, 26, '#4ade80', 1.6);
    if (this.onClear) this.onClear();
  }
};

FL.Game.prototype.updateEnemy = function (e, dt) {
  const p = this.player;
  const d = U.dist(e.x, e.y, p.x, p.y);

  /* ---- detecção: alcance (menor se o jogador está silencioso) + linha de visão ---- */
  if (!this.over) {
    const range = this.cfg.view * (p.sneak ? 0.5 : 1);
    const facing = Math.abs(U.norm(U.angleTo(e.x, e.y, p.x, p.y) - Math.atan2(e.dy, e.dx))) < 1.25;
    const seen = d < range && this.los(e.x, e.y, p.x, p.y) && (facing || d < 1.7);
    if (seen && e.state !== 'chase') {
      e.state = 'chase';
      e.loseT = 0;
      FL.Audio.detect();
      this.ring(e.x, e.y, '#ff4d5e', 1.1);
      this.shakeT = 0.18;
    }
    if (seen) { e.lx = p.x; e.ly = p.y; }

    if (e.state === 'chase' && !seen) {
      e.loseT += dt;
      if (e.loseT > 0.45) { e.state = 'search'; }
    } else if (e.state === 'chase') {
      e.loseT = 0;
    }
  }

  /* ---- movimento por estado ---- */
  if (e.state === 'chase') {
    const dx = p.x - e.x, dy = p.y - e.y, l = Math.hypot(dx, dy) || 1;
    const sp = this.cfg.chase;
    if (l > 0.01) { e.dx = dx / l; e.dy = dy / l; }
    this.moveEnt(e, (dx / l) * sp * dt, (dy / l) * sp * dt);
  } else if (e.state === 'search') {
    const dx = e.lx - e.x, dy = e.ly - e.y, l = Math.hypot(dx, dy);
    if (l > 0.35) {
      const sp = this.cfg.speed * 1.2;
      this.moveEnt(e, (dx / l) * sp * dt, (dy / l) * sp * dt);
    } else {
      e.state = 'look';
      e.lookT = 1.8;
      e.turnT = 0;
    }
  } else if (e.state === 'look') {
    e.lookT -= dt;
    e.turnT -= dt;
    if (e.turnT <= 0) {
      e.turnT = 0.45;
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const d2 = dirs[(Math.random() * 4) | 0];
      e.dx = d2[0]; e.dy = d2[1];
    }
    if (e.lookT <= 0) e.state = 'patrol';
  } else {
    this.patrol(e, dt);
  }
};

/* patrulha em eixos, virando nas encruzilhadas e pelo menos a cada 1s */
FL.Game.prototype.patrol = function (e, dt) {
  const sp = this.cfg.speed;
  this.moveEnt(e, e.dx * sp * dt, e.dy * sp * dt);

  /* gruda no centro do corredor no eixo perpendicular */
  if (e.dx !== 0) e.y = U.lerp(e.y, Math.floor(e.y) + 0.5, Math.min(1, 8 * dt));
  else e.x = U.lerp(e.x, Math.floor(e.x) + 0.5, Math.min(1, 8 * dt));

  e.turnT -= dt;

  const cx = Math.floor(e.x) + 0.5, cy = Math.floor(e.y) + 0.5;
  if (Math.abs(e.x - cx) < 0.06 && Math.abs(e.y - cy) < 0.06) {
    e.x = cx; e.y = cy;
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const opts = DIRS.filter((d) => !this.blockedAt(e.x + d[0] * 0.6, e.y + d[1] * 0.6));
    if (opts.length === 0) { e.dx = -e.dx; e.dy = -e.dy; return; }
    const straight = opts.some((d) => d[0] === e.dx && d[1] === e.dy);
    /* laterais = tudo que não é seguir em frente nem voltar */
    const side = opts.filter((d) => !(d[0] === e.dx && d[1] === e.dy) && !(d[0] === -e.dx && d[1] === -e.dy));
    /* só vira se: beco sem saída, ou sorteio (6%), ou já faz 5s sem virar */
    const mustTurn = e.turnT <= 0 && side.length > 0;
    if (!straight || mustTurn || (side.length > 0 && Math.random() < 0.06)) {
      const pool = side.length ? side : (opts.filter((d) => !(d[0] === -e.dx && d[1] === -e.dy)));
      const nd = (pool.length ? pool : opts)[(Math.random() * (pool.length ? pool.length : opts.length)) | 0];
      e.dx = nd[0]; e.dy = nd[1];
      e.turnT = 5;                       /* respiro de 5s até a próxima virada */
    }
  }
};

FL.Game.prototype.caught = function () {
  if (this.over) return;
  this.over = true;
  this.status = 'hunted';
  this.shakeT = 0.45;
  this.burst(this.player.x, this.player.y, 30, '#ff4d5e', 2.2);
  this.ring(this.player.x, this.player.y, '#ff4d5e', 2.4);
  if (this.onCaught) this.onCaught();
};

/* ---------- desenho ---------- */
FL.Game.prototype.draw = function (ctx) {
  const TS = this.ts, ox = this.ox, oy = this.oy;
  const W = this.cols * TS, H = this.rows * TS;
  const X = (tx) => ox + tx * TS;
  const Y = (ty) => oy + ty * TS;

  ctx.save();
  ctx.fillStyle = '#070b10';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  if (this.shakeT > 0) {
    const p = this.shakeT * 22;
    ctx.translate((Math.random() - 0.5) * p, (Math.random() - 0.5) * p);
  }

  /* ---- chão ---- */
  for (let y = 0; y < this.rows; y++) {
    for (let x = 0; x < this.cols; x++) {
      if (this.grid[y][x] === 1) continue;
      ctx.fillStyle = (x + y) % 2 === 0 ? '#0d1522' : '#0f1826';
      ctx.fillRect(X(x), Y(y), TS + 1, TS + 1);
    }
  }
  ctx.strokeStyle = 'rgba(120,180,255,0.045)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= this.cols; x++) { ctx.moveTo(X(x), Y(0)); ctx.lineTo(X(x), Y(this.rows)); }
  for (let y = 0; y <= this.rows; y++) { ctx.moveTo(X(0), Y(y)); ctx.lineTo(X(this.cols), Y(y)); }
  ctx.stroke();

  /* ---- paredes ---- */
  for (let y = 0; y < this.rows; y++) {
    for (let x = 0; x < this.cols; x++) {
      if (this.grid[y][x] !== 1) continue;
      ctx.fillStyle = '#1b2a44';
      ctx.fillRect(X(x), Y(y), TS + 1, TS + 1);
      ctx.fillStyle = 'rgba(140,190,255,0.10)';
      ctx.fillRect(X(x), Y(y), TS + 1, Math.max(2, TS * 0.09));
    }
  }

  /* ---- saída (portal) ---- */
  const t = this.time;
  const pulse = 0.6 + 0.4 * Math.sin(t * 4);
  const ex = X(this.exit.x), ey = Y(this.exit.y), er = TS * (0.30 + 0.06 * pulse);
  const grad = ctx.createRadialGradient(ex, ey, er * 0.2, ex, ey, er * 1.9);
  grad.addColorStop(0, 'rgba(74,222,128,0.55)');
  grad.addColorStop(1, 'rgba(74,222,128,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(ex - er * 2, ey - er * 2, er * 4, er * 4);
  ctx.fillStyle = '#4ade80';
  ctx.beginPath(); ctx.arc(ex, ey, er, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = `rgba(74,222,128,${0.35 + 0.3 * pulse})`;
  ctx.lineWidth = Math.max(2, TS * 0.07);
  ctx.beginPath(); ctx.arc(ex, ey, er + TS * 0.14 * pulse, 0, Math.PI * 2); ctx.stroke();

  /* ---- guardas ---- */
  for (const e of this.enemies) {
    const px = X(e.x), py = Y(e.y);

    /* cone de visão — recortado pelas paredes (raycast no grid) */
    if (e.state !== 'chase') {
      const a = Math.atan2(e.dy, e.dx);
      const viewT = this.cfg.view * (this.player.sneak ? 0.5 : 1);
      const RAYS = 26;
      ctx.fillStyle = 'rgba(255,77,94,0.10)';
      ctx.beginPath();
      ctx.moveTo(px, py);
      for (let i = 0; i <= RAYS; i++) {
        const ang = a - 1.25 + (2.5 * i) / RAYS;
        const hit = this.rayHit(e.x, e.y, Math.cos(ang), Math.sin(ang), viewT);
        ctx.lineTo(X(e.x + Math.cos(ang) * hit), Y(e.y + Math.sin(ang) * hit));
      }
      ctx.closePath();
      ctx.fill();
    } else if (this.los(e.x, e.y, this.player.x, this.player.y)) {
      /* caçando: linha até o jogador */
      ctx.strokeStyle = 'rgba(255,77,94,0.5)';
      ctx.lineWidth = Math.max(1, TS * 0.04);
      ctx.setLineDash([TS * 0.18, TS * 0.14]);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(X(this.player.x), Y(this.player.y));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    /* corpo */
    ctx.fillStyle = e.state === 'chase' ? '#ff2d45' : '#ff4d5e';
    ctx.beginPath(); ctx.arc(px, py, e.r * TS, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = Math.max(1, TS * 0.045);
    ctx.stroke();

    /* olhinhos na direção */
    const a = Math.atan2(e.dy, e.dx);
    const exx = px + Math.cos(a) * e.r * TS * 0.45, eyy = py + Math.sin(a) * e.r * TS * 0.45;
    ctx.fillStyle = '#ffdfe3';
    ctx.beginPath(); ctx.arc(exx, eyy, e.r * TS * 0.16, 0, Math.PI * 2); ctx.fill();

    /* "!" ao detectar */
    if (e.state === 'chase') {
      ctx.fillStyle = '#ff4d5e';
      ctx.font = `bold ${Math.round(TS * 0.8)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('!', px, py - e.r * TS - TS * 0.18);
    }
  }

  /* ---- jogador ---- */
  const p = this.player;
  const px = X(p.x), py = Y(p.y), pr = p.hw * TS;
  ctx.fillStyle = p.sneak ? '#7ef0e4' : '#35e0d0';
  ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = p.sneak ? 'rgba(126,240,228,0.4)' : 'rgba(53,224,208,0.55)';
  ctx.lineWidth = Math.max(1.5, TS * 0.06);
  if (p.sneak) ctx.setLineDash([TS * 0.12, TS * 0.12]);
  ctx.beginPath(); ctx.arc(px, py, pr + TS * 0.16, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = '#0b3b3a';
  ctx.lineWidth = Math.max(2, TS * 0.09);
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px + p.dx * pr * 1.5, py + p.dy * pr * 1.5);
  ctx.stroke();

  /* ---- ondas de choque ---- */
  for (const r of this.rings) {
    ctx.strokeStyle = rgba(r.color, r.life / 0.55);
    ctx.lineWidth = Math.max(2, TS * 0.08 * (r.life / 0.55));
    ctx.beginPath(); ctx.arc(X(r.x), Y(r.y), r.r * TS, 0, Math.PI * 2); ctx.stroke();
  }

  /* ---- partículas ---- */
  for (const q of this.parts) {
    ctx.globalAlpha = Math.max(0, q.life / q.max);
    ctx.fillStyle = q.color;
    const s = q.size * TS;
    ctx.fillRect(X(q.x) - s / 2, Y(q.y) - s / 2, s, s);
  }
  ctx.globalAlpha = 1;

  /* ---- vinheta ---- */
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  ctx.restore();

  function rgba(hex, a) { return FL.U.hexRgba(hex, a); }
};
