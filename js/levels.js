/* ============================================================
   levels.js  —  configuração das 5 fases + geração procedural
   dos labirintos (backtracker + aberturas para criar rotas)
   ============================================================ */
window.FL = window.FL || {};

FL.Levels = (function () {
  const U = FL.U;

  /* cada fase: tamanho, nº de guardas, visão e velocidade (crescente) */
  const LEVELS = [
    { cols: 15, rows: 11, enemies: 2, view: 5.5, speed: 2.4, chase: 3.4, braid: 6 },
    { cols: 17, rows: 13, enemies: 3, view: 6.0, speed: 2.6, chase: 3.6, braid: 10 },
    { cols: 21, rows: 13, enemies: 4, view: 6.5, speed: 2.8, chase: 3.9, braid: 14 },
    { cols: 23, rows: 15, enemies: 5, view: 7.0, speed: 3.0, chase: 4.1, braid: 18 },
    { cols: 27, rows: 17, enemies: 6, view: 7.5, speed: 3.2, chase: 4.3, braid: 24 }
  ];

  const DIRS = [[2, 0], [-2, 0], [0, 2], [0, -2]];

  /* labirinto perfeito por recursão (iterativa) — grade ímpar */
  function carve(cols, rows, r) {
    const g = [];
    for (let y = 0; y < rows; y++) g.push(new Array(cols).fill(1));
    const stack = [[1, 1]];
    g[1][1] = 0;
    while (stack.length) {
      const [x, y] = stack[stack.length - 1];
      const dirs = U.shuffle(DIRS.slice(), r);
      let moved = false;
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        if (nx > 0 && ny > 0 && nx < cols - 1 && ny < rows - 1 && g[ny][nx] === 1) {
          g[ny][nx] = 0;
          g[y + dy / 2][x + dx / 2] = 0;
          stack.push([nx, ny]);
          moved = true;
          break;
        }
      }
      if (!moved) stack.pop();
    }
    return g;
  }

  /* abre paredes internas: cria ciclos e atalhos (labirinto menos "seco") */
  function braid(g, cols, rows, n, r) {
    let removed = 0, guard = 0;
    while (removed < n && guard++ < n * 60) {
      const x = 1 + Math.floor(r() * (cols - 2));
      const y = 1 + Math.floor(r() * (rows - 2));
      if (g[y][x] !== 1) continue;
      if (x % 2 === 0 && y % 2 === 0) continue;                       /* pilar do labirinto */
      const horiz = g[y][x - 1] === 0 && g[y][x + 1] === 0 && g[y - 1][x] === 1 && g[y + 1][x] === 1;
      const vert  = g[y - 1][x] === 0 && g[y + 1][x] === 0 && g[y][x - 1] === 1 && g[y][x + 1] === 1;
      if (horiz || vert) { g[y][x] = 0; removed++; }
    }
    return g;
  }

  const taxi = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

  function generate(index) {
    const cfg = LEVELS[index];
    const r = U.rng(0x9e3779b9 + index * 7919);   /* semente fixa por fase */
    const cols = cfg.cols % 2 === 0 ? cfg.cols + 1 : cfg.cols;
    const rows = cfg.rows % 2 === 0 ? cfg.rows + 1 : cfg.rows;

    const grid = braid(carve(cols, rows, r), cols, rows, cfg.braid, r);

    const spawn = { x: 1, y: 1 };
    const exit = { x: cols - 2, y: rows - 2 };
    grid[exit.y][exit.x] = 0;

    /* guardas em células distantes do spawn, da saída e entre si */
    const cells = [];
    for (let y = 1; y < rows - 1; y += 2)
      for (let x = 1; x < cols - 1; x += 2)
        if (grid[y][x] === 0 && !(x === spawn.x && y === spawn.y) && !(x === exit.x && y === exit.y)) cells.push({ x, y });
    U.shuffle(cells, r);

    const enemies = [];
    const minSpawn = Math.floor((cols + rows) / 3);
    for (const c of cells) {
      if (enemies.length >= cfg.enemies) break;
      if (taxi(c, spawn) < minSpawn) continue;
      if (taxi(c, exit) < 4) continue;
      if (enemies.some(o => taxi(o, c) < 5)) continue;
      enemies.push(c);
    }

    return { grid, cols, rows, spawn, exit, enemies, cfg: Object.assign({}, cfg, { cols, rows }) };
  }

  return { LEVELS, generate };
})();
