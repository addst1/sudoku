/*!
 * Sudoku engine: 퍼즐 생성(유일해 보장), 풀이, 난이도 판정
 * 브라우저(window.SudokuEngine)와 Node(require) 양쪽에서 동작합니다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SudokuEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ALL = 0x1ff;
  const POP = new Uint8Array(512);
  for (let i = 1; i < 512; i++) POP[i] = POP[i >> 1] + (i & 1);

  const ROW = new Uint8Array(81);
  const COL = new Uint8Array(81);
  const BOX = new Uint8Array(81);
  for (let i = 0; i < 81; i++) {
    ROW[i] = (i / 9) | 0;
    COL[i] = i % 9;
    BOX[i] = (((ROW[i] / 3) | 0) * 3) + ((COL[i] / 3) | 0);
  }

  const PEERS = [];
  for (let i = 0; i < 81; i++) {
    const p = [];
    for (let j = 0; j < 81; j++) {
      if (j !== i && (ROW[j] === ROW[i] || COL[j] === COL[i] || BOX[j] === BOX[i])) p.push(j);
    }
    PEERS.push(p);
  }

  const UNITS = [];
  for (let u = 0; u < 9; u++) {
    const r = [], c = [], b = [];
    for (let i = 0; i < 81; i++) {
      if (ROW[i] === u) r.push(i);
      if (COL[i] === u) c.push(i);
      if (BOX[i] === u) b.push(i);
    }
    UNITS.push(r, c, b);
  }

  /** 난이도 설정: target = 목표 단서 수, singles = 싱글(단일 후보)만으로 풀 수 있어야 함 */
  const LEVELS = {
    easy: { target: 42, singles: true, mustBeHard: false },
    medium: { target: 34, singles: true, mustBeHard: false },
    hard: { target: 27, singles: false, mustBeHard: true },
  };

  function seeded(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rnd) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /**
   * 백트래킹 탐색(최소 후보 칸 우선).
   * limit개의 해를 찾으면 멈추고 { count, solution(첫 해) }를 돌려줍니다.
   */
  function search(puzzle, limit, randomize, rnd) {
    const g = Uint8Array.from(puzzle);
    const rows = new Uint16Array(9);
    const cols = new Uint16Array(9);
    const boxes = new Uint16Array(9);
    for (let i = 0; i < 81; i++) {
      const v = g[i];
      if (!v) continue;
      const bit = 1 << (v - 1);
      if ((rows[ROW[i]] | cols[COL[i]] | boxes[BOX[i]]) & bit) return { count: 0, solution: null };
      rows[ROW[i]] |= bit; cols[COL[i]] |= bit; boxes[BOX[i]] |= bit;
    }

    let count = 0;
    let solution = null;

    function recurse() {
      let best = -1, bestMask = 0, bestN = 10;
      for (let i = 0; i < 81; i++) {
        if (g[i]) continue;
        const m = ALL & ~(rows[ROW[i]] | cols[COL[i]] | boxes[BOX[i]]);
        const n = POP[m];
        if (n === 0) return;
        if (n < bestN) {
          best = i; bestMask = m; bestN = n;
          if (n === 1) break;
        }
      }
      if (best < 0) {
        count++;
        if (!solution) solution = Array.from(g);
        return;
      }
      const vals = [];
      for (let v = 1; v <= 9; v++) if (bestMask & (1 << (v - 1))) vals.push(v);
      if (randomize) shuffle(vals, rnd);
      const r = ROW[best], c = COL[best], b = BOX[best];
      for (let k = 0; k < vals.length; k++) {
        const v = vals[k];
        const bit = 1 << (v - 1);
        g[best] = v; rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit;
        recurse();
        rows[r] &= ~bit; cols[c] &= ~bit; boxes[b] &= ~bit; g[best] = 0;
        if (count >= limit) return;
      }
    }

    recurse();
    return { count, solution };
  }

  function solve(puzzle) {
    return search(puzzle, 1, false).solution;
  }

  function countSolutions(puzzle, limit) {
    return search(puzzle, limit || 2, false).count;
  }

  /** 단일 후보(naked single) + 숨은 단일(hidden single)만으로 끝까지 풀리는지 */
  function singlesSolvable(puzzle) {
    const g = Uint8Array.from(puzzle);
    const rows = new Uint16Array(9);
    const cols = new Uint16Array(9);
    const boxes = new Uint16Array(9);
    let empty = 0;
    for (let i = 0; i < 81; i++) {
      if (g[i]) {
        const bit = 1 << (g[i] - 1);
        rows[ROW[i]] |= bit; cols[COL[i]] |= bit; boxes[BOX[i]] |= bit;
      } else empty++;
    }
    const place = (i, v) => {
      const bit = 1 << (v - 1);
      g[i] = v; rows[ROW[i]] |= bit; cols[COL[i]] |= bit; boxes[BOX[i]] |= bit;
      empty--;
    };
    const cand = (i) => ALL & ~(rows[ROW[i]] | cols[COL[i]] | boxes[BOX[i]]);

    while (empty > 0) {
      let progress = false;
      for (let i = 0; i < 81; i++) {
        if (g[i]) continue;
        const m = cand(i);
        if (m === 0) return false;
        if (POP[m] === 1) { place(i, 32 - Math.clz32(m)); progress = true; }
      }
      if (progress) continue;
      for (let u = 0; u < UNITS.length; u++) {
        const unit = UNITS[u];
        for (let v = 1; v <= 9; v++) {
          const bit = 1 << (v - 1);
          let spot = -1, n = 0;
          for (let k = 0; k < 9; k++) {
            const i = unit[k];
            if (!g[i] && (cand(i) & bit)) {
              spot = i;
              if (++n > 1) break;
            }
          }
          if (n === 1) { place(spot, v); progress = true; }
        }
      }
      if (!progress) return false;
    }
    return true;
  }

  function makePuzzle(solution, level, rnd) {
    const cfg = LEVELS[level];
    const puzzle = solution.slice();
    // 180도 회전 대칭으로 지워서 보기 좋은 배치를 만든다
    const order = shuffle(Array.from({ length: 41 }, (_, i) => i), rnd);
    let clues = 81;
    for (let k = 0; k < order.length; k++) {
      if (clues <= cfg.target) break;
      const i = order[k];
      const j = 80 - i;
      const a = puzzle[i], b = puzzle[j];
      puzzle[i] = 0; puzzle[j] = 0;
      let ok = search(puzzle, 2, false).count === 1;
      if (ok && cfg.singles && !singlesSolvable(puzzle)) ok = false;
      if (ok) clues -= (i === j ? 1 : 2);
      else { puzzle[i] = a; puzzle[j] = b; }
    }
    return { puzzle, clues };
  }

  /** 새 퍼즐 생성. 반환: { puzzle, solution, difficulty, clues } (빈 칸은 0) */
  function generate(level, rnd) {
    level = level || 'medium';
    rnd = rnd || Math.random;
    const cfg = LEVELS[level];
    if (!cfg) throw new Error('unknown difficulty: ' + level);
    let result = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      const solution = search(new Array(81).fill(0), 1, true, rnd).solution;
      const { puzzle, clues } = makePuzzle(solution, level, rnd);
      result = { puzzle, solution, difficulty: level, clues };
      if (!cfg.mustBeHard || !singlesSolvable(puzzle)) break;
    }
    return result;
  }

  function isValidSolution(grid) {
    if (!grid || grid.length !== 81) return false;
    for (let u = 0; u < UNITS.length; u++) {
      let seen = 0;
      for (let k = 0; k < 9; k++) {
        const v = grid[UNITS[u][k]];
        if (!(v >= 1 && v <= 9)) return false;
        seen |= 1 << (v - 1);
      }
      if (seen !== ALL) return false;
    }
    return true;
  }

  return {
    ROW, COL, BOX, PEERS, UNITS, LEVELS,
    generate, solve, countSolutions, singlesSolvable, isValidSolution, seeded,
  };
});
