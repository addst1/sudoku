(function () {
  'use strict';

  const E = window.SudokuEngine;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const KEY = { game: 'sudoku.game.v1', stats: 'sudoku.stats.v1', settings: 'sudoku.settings.v1' };
  const DIFFS = ['easy', 'medium', 'hard'];
  const DIFF_NAME = { easy: '쉬움', medium: '보통', hard: '어려움' };
  const HISTORY_LIMIT = 300;
  const MIN_LIVES = 1;
  const MAX_LIVES = 10;
  const SUN = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>';
  const MOON = '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>';

  /* ------------------------------------------------------------------ 저장소 */
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) { return fallback; }
    },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 저장 불가 환경 */ } },
    del(key) { try { localStorage.removeItem(key); } catch (e) { /* noop */ } },
  };

  /* ------------------------------------------------------------------ 설정 */
  const settings = Object.assign(
    { showErrors: true, highlight: true, theme: 'auto', lives: 3, fastInput: false },
    store.get(KEY.settings, {})
  );
  settings.lives = Math.min(MAX_LIVES, Math.max(MIN_LIVES, parseInt(settings.lives, 10) || 3));
  const THEME_COLOR = { light: '#f4f6fb', dark: '#0f121a' };

  function applyTheme() {
    const root = document.documentElement;
    if (settings.theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
    $$('meta[name="theme-color"]').forEach((m) => {
      if (!m.dataset.orig) m.dataset.orig = m.getAttribute('content');
      m.setAttribute('content', settings.theme === 'auto' ? m.dataset.orig : THEME_COLOR[settings.theme]);
    });
    renderThemeIcon();
  }

  function effectiveTheme() {
    if (settings.theme !== 'auto') return settings.theme;
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function renderThemeIcon() {
    const ico = $('#ico-theme');
    if (!ico) return;
    const dark = effectiveTheme() === 'dark';
    ico.innerHTML = dark ? SUN : MOON;
    $('#btn-theme-quick').setAttribute('aria-label', dark ? '라이트 모드로 전환' : '다크 모드로 전환');
  }

  /* ------------------------------------------------------------------ 기록 */
  const blankStat = () => ({ played: 0, won: 0, best: null, total: 0, streak: 0, bestStreak: 0 });
  const stats = (function () {
    const saved = store.get(KEY.stats, {});
    const out = {};
    DIFFS.forEach((d) => { out[d] = Object.assign(blankStat(), saved[d]); });
    return out;
  })();
  const saveStats = () => store.set(KEY.stats, stats);

  /* ------------------------------------------------------------------ 상태 */
  let G = null;            // 현재 게임
  let noteMode = false;
  let activeNum = 0;       // 빠른 입력에서 골라 둔 숫자 (0 = 없음)
  let paused = false;
  let timerId = null;
  let lastTs = 0;
  let lastSave = 0;

  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h ? h + ':' + mm + ':' + ss : mm + ':' + ss;
  }

  const isLocked = (i) => G.puzzle[i] !== 0 || G.hinted.indexOf(i) !== -1;

  /* ------------------------------------------------------------------ 저장/불러오기 */
  function serialize() {
    return {
      v: 1,
      difficulty: G.difficulty,
      puzzle: G.puzzle,
      solution: G.solution,
      values: G.values,
      notes: G.notes,
      hinted: G.hinted,
      elapsed: Math.floor(G.elapsed),
      mistakes: G.mistakes,
      lives: G.lives,
      maxLives: G.maxLives,
      hints: G.hints,
      history: G.history.slice(-100),
      future: G.future.slice(-100),
      selected: G.selected,
      noteMode: noteMode,
    };
  }

  function saveGame() {
    if (!G || G.completed || G.over) return;
    store.set(KEY.game, serialize());
  }

  function loadSaved() {
    const s = store.get(KEY.game, null);
    if (!s || s.v !== 1 || !DIFF_NAME[s.difficulty]) return null;
    const ok = ['puzzle', 'solution', 'values', 'notes'].every((k) => Array.isArray(s[k]) && s[k].length === 81);
    return ok ? s : null;
  }

  function startFrom(s) {
    const maxLives = Number.isInteger(s.maxLives) ? s.maxLives : settings.lives;
    const lives = Number.isInteger(s.lives) ? s.lives : Math.max(1, maxLives - (s.mistakes || 0));
    G = {
      difficulty: s.difficulty,
      puzzle: s.puzzle.slice(),
      solution: s.solution.slice(),
      values: s.values.slice(),
      notes: s.notes.slice(),
      hinted: Array.isArray(s.hinted) ? s.hinted.filter((i) => s.values[i] === s.solution[i]) : [],
      elapsed: s.elapsed || 0,
      mistakes: s.mistakes || 0,
      lives: lives,
      maxLives: maxLives,
      over: false,
      hints: s.hints || 0,
      history: Array.isArray(s.history) ? s.history : [],
      future: Array.isArray(s.future) ? s.future : [],
      selected: typeof s.selected === 'number' ? s.selected : -1,
      completed: false,
    };
    noteMode = !!s.noteMode;
    activeNum = 0;
    paused = false;
    $('#board').classList.remove('win');
    $('#pause-overlay').hidden = true;
    showScreen('game');
    renderAll();
    startTimer();
  }

  /* ------------------------------------------------------------------ 화면 전환 */
  function showScreen(name) {
    $('#screen-home').hidden = name !== 'home';
    $('#screen-game').hidden = name !== 'game';
    window.scrollTo(0, 0);
  }

  function goHome() {
    saveGame();
    stopTimer();
    renderHome();
    showScreen('home');
  }

  function renderHome() {
    const saved = loadSaved();
    const btn = $('#btn-continue');
    btn.hidden = !saved;
    if (saved) {
      let filled = 0, total = 0;
      for (let i = 0; i < 81; i++) {
        if (saved.puzzle[i] === 0) { total++; if (saved.values[i] !== 0) filled++; }
      }
      const pct = total ? Math.round((filled / total) * 100) : 0;
      $('#continue-info').textContent = DIFF_NAME[saved.difficulty] + ' · ' + fmt((saved.elapsed || 0) / 1000) + ' · ' + pct + '%';
    }
    DIFFS.forEach((d) => {
      const el = $('[data-best="' + d + '"]');
      el.textContent = stats[d].best !== null ? '최단 ' + fmt(stats[d].best) : '';
    });
  }

  /* ------------------------------------------------------------------ 타이머 */
  function startTimer() {
    stopTimer();
    lastTs = performance.now();
    lastSave = lastTs;
    timerId = setInterval(tick, 250);
  }
  function stopTimer() {
    if (timerId) clearInterval(timerId);
    timerId = null;
  }
  function tick() {
    const now = performance.now();
    const dt = now - lastTs;
    lastTs = now;
    if (!G || G.completed || G.over || paused || document.hidden || document.querySelector('dialog[open]')) return;
    G.elapsed += Math.min(dt, 2000);
    renderTime();
    if (now - lastSave > 5000) { saveGame(); lastSave = now; }
  }
  function renderTime() {
    const t = fmt(G.elapsed / 1000);
    const el = $('#g-time');
    if (el.textContent !== t) el.textContent = t;
  }

  /* ------------------------------------------------------------------ 보드 생성/렌더 */
  const board = $('#board');
  const cells = [];

  function buildBoard() {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 81; i++) {
      const r = (i / 9) | 0, c = i % 9;
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.i = String(i);
      let base = 'cell';
      if (c % 3 === 2 && c < 8) base += ' bR';
      if (c === 8) base += ' cR';
      if (r % 3 === 2 && r < 8) base += ' bB';
      if (r === 8) base += ' cB';
      b.className = base;
      b.style.setProperty('--d', String(r + c));
      const v = document.createElement('span');
      v.className = 'v';
      const n = document.createElement('span');
      n.className = 'notes';
      const ns = [];
      for (let k = 0; k < 9; k++) {
        const s = document.createElement('span');
        n.appendChild(s);
        ns.push(s);
      }
      b.appendChild(v);
      b.appendChild(n);
      cells.push({ el: b, v: v, ns: ns, base: base, sig: '' });
      frag.appendChild(b);
    }
    board.appendChild(frag);
  }

  function buildNumpad() {
    const pad = $('#numpad');
    for (let n = 1; n <= 9; n++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'num';
      b.dataset.n = String(n);
      b.setAttribute('aria-label', n + ' 입력');
      b.innerHTML = '<span class="d">' + n + '</span><span class="left"></span>';
      pad.appendChild(b);
    }
  }

  function renderCell(i, sel, selVal) {
    const C = cells[i];
    const v = G.values[i];
    const nt = G.notes[i];
    const given = G.puzzle[i] !== 0;
    const hinted = !given && G.hinted.indexOf(i) !== -1;
    const isSel = i === sel;
    const related = sel >= 0 && !isSel && settings.highlight &&
      (E.ROW[i] === E.ROW[sel] || E.COL[i] === E.COL[sel] || E.BOX[i] === E.BOX[sel]);
    const fast = settings.fastInput && activeNum !== 0;
    const same = (settings.highlight || fast) && selVal !== 0 && v === selVal && !isSel;
    const err = settings.showErrors && v !== 0 && !given && !hinted && v !== G.solution[i];

    let cls = C.base;
    if (given) cls += ' given';
    else if (hinted) cls += ' hinted';
    else if (v) cls += ' user';
    if (related) cls += ' peer';
    if (same) cls += ' same';
    if (isSel) cls += ' sel';
    if (err) cls += ' err';

    const noteHl = v === 0 && nt !== 0 && (settings.highlight || fast) ? selVal : 0;
    const sig = v + '|' + nt + '|' + cls + '|' + noteHl;
    if (sig === C.sig) return;
    C.sig = sig;

    C.el.className = cls;
    C.v.textContent = v ? String(v) : '';
    for (let k = 0; k < 9; k++) {
      const on = v === 0 && (nt & (1 << k)) !== 0;
      const s = C.ns[k];
      s.textContent = on ? String(k + 1) : '';
      s.className = on && noteHl === k + 1 ? 'hl' : '';
    }
    let label = ((E.ROW[i] + 1) + '행 ' + (E.COL[i] + 1) + '열, ');
    label += v ? v : (nt ? '메모 있음' : '빈 칸');
    if (given) label += ', 고정';
    if (err) label += ', 오류';
    C.el.setAttribute('aria-label', label);
  }

  function renderAll() {
    if (!G) return;
    const done = G.completed || G.over;
    const counts = new Array(10).fill(0);
    for (let i = 0; i < 81; i++) if (G.values[i] && G.values[i] === G.solution[i]) counts[G.values[i]]++;
    if (activeNum && (done || !settings.fastInput || counts[activeNum] >= 9)) activeNum = 0;
    const sel = G.selected;
    const selVal = sel >= 0 ? G.values[sel] : 0;
    const hlVal = settings.fastInput && activeNum !== 0 ? activeNum : selVal;
    for (let i = 0; i < 81; i++) renderCell(i, sel, hlVal);

    // 숫자패드: 남은 개수 / 빠른 입력으로 고른 숫자
    $$('.num').forEach((b) => {
      const n = Number(b.dataset.n);
      const left = 9 - counts[n];
      const on = settings.fastInput && activeNum === n;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
      b.querySelector('.left').textContent = left > 0 ? String(left) : '';
      b.disabled = left <= 0 || done;
    });
    $('#numpad').classList.toggle('notes-on', noteMode);

    // 헤더 / 도구
    $('#g-diff').textContent = DIFF_NAME[G.difficulty];
    renderLives();
    renderTime();
    $('#btn-undo').disabled = G.history.length === 0 || done;
    $('#btn-redo').disabled = G.future.length === 0 || done;
    $('#btn-erase').disabled = done;
    $('#btn-hint').disabled = done;
    $('#btn-notes').setAttribute('aria-pressed', String(noteMode));
    $('#notes-state').textContent = noteMode ? '켬' : '끔';
    $('#hint-count').textContent = String(G.hints);
    $('#btn-fast').checked = settings.fastInput;
    $('.fast-row').classList.toggle('on', settings.fastInput);
    $('#fast-hint').textContent = !settings.fastInput
      ? '판이나 아래 숫자를 고른 뒤 빈 칸을 누르면 바로 입력돼요'
      : (activeNum ? activeNum + ' 입력 중 · 빈 칸을 누르세요' : '판의 숫자나 아래 숫자를 눌러 고르세요');
  }

  /* ------------------------------------------------------------------ 편집 (되돌리기 지원) */
  function transact(mutator) {
    const before = new Map();
    const touch = (i) => { if (!before.has(i)) before.set(i, [G.values[i], G.notes[i]]); };
    mutator(touch);
    const entry = [];
    before.forEach((prev, i) => {
      if (prev[0] !== G.values[i] || prev[1] !== G.notes[i]) entry.push([i, prev[0], prev[1], G.values[i], G.notes[i]]);
    });
    if (entry.length) {
      G.history.push(entry);
      if (G.history.length > HISTORY_LIMIT) G.history.shift();
      G.future.length = 0;
    }
    return entry.length ? entry : null;
  }

  function afterChange() {
    renderAll();
    saveGame();
    if (!G.completed && isSolved()) onWin();
  }

  function isSolved() {
    for (let i = 0; i < 81; i++) if (G.values[i] !== G.solution[i]) return false;
    return true;
  }

  function usable() { return G && !G.completed && !G.over && !paused; }

  function select(i) {
    if (!usable()) return;
    G.selected = i;
    renderAll();
  }

  function inputNumber(n) {
    if (!usable()) return;
    if (G.selected < 0) { toast('먼저 칸을 선택하세요'); return; }
    placeNumber(G.selected, n, false);
  }

  function placeNumber(i, n, quiet) {
    if (isLocked(i)) { if (!quiet) toast('고정된 칸이에요'); return; }
    const bit = 1 << (n - 1);

    if (noteMode) {
      if (G.values[i] !== 0) { if (!quiet) toast('숫자가 있는 칸엔 메모할 수 없어요'); return; }
      transact((touch) => { touch(i); G.notes[i] ^= bit; });
      afterChange();
      return;
    }

    if (G.values[i] === n) {          // 같은 숫자를 다시 누르면 지움
      transact((touch) => { touch(i); G.values[i] = 0; });
      afterChange();
      return;
    }

    transact((touch) => {
      touch(i);
      G.values[i] = n;
      G.notes[i] = 0;
    });
    const wrong = n !== G.solution[i];
    if (wrong) {
      G.mistakes++;
      G.lives = Math.max(0, G.lives - 1);
      try { if (navigator.vibrate) navigator.vibrate(40); } catch (e) { /* noop */ }
    }
    afterChange();
    if (wrong) {
      pulseLives();
      if (G.lives <= 0) onOver();
    }
  }

  /* 빠른 입력: 입력할 숫자를 '아래 숫자패드' 또는 '판 위의 숫자'로 고른다(둘 중 아무거나).
     그 뒤 빈 칸을 누를 때마다 같은 숫자가 바로 들어가고, 메모 모드면 메모로 들어간다.
     숫자가 든 칸을 누르면 그 숫자를 고른 것으로 바뀐다(지우려면 칸 선택 후 '지우기'). */
  function tapCell(i) {
    if (!usable()) return;
    if (settings.fastInput) {
      G.selected = i;
      const v = G.values[i];
      if (v !== 0) activeNum = v;                                  // 판 위의 숫자를 눌러 입력할 숫자로 고름
      else if (activeNum !== 0) placeNumber(i, activeNum, true);   // 빈 칸이면 고른 숫자를 입력
      renderAll();
      return;
    }
    select(i);
  }

  function chooseNumber(n) {
    if (!usable()) return;
    activeNum = activeNum === n ? 0 : n;
    renderAll();
  }

  function setFast(on) {
    if (!G) return;
    settings.fastInput = !!on;
    activeNum = 0;
    store.set(KEY.settings, settings);
    renderAll();
  }

  function erase() {
    if (!usable()) return;
    const i = G.selected;
    if (i < 0 || isLocked(i)) return;
    if (G.values[i] === 0 && G.notes[i] === 0) return;
    transact((touch) => { touch(i); G.values[i] = 0; G.notes[i] = 0; });
    afterChange();
  }

  function undo() {
    if (!usable() || !G.history.length) return;
    const entry = G.history.pop();
    entry.forEach((c) => {
      G.values[c[0]] = c[1];
      G.notes[c[0]] = c[2];
      if (c[5]) { const k = G.hinted.indexOf(c[0]); if (k !== -1) G.hinted.splice(k, 1); }
    });
    G.future.push(entry);
    G.selected = entry[0][0];
    afterChange();
  }

  function redo() {
    if (!usable() || !G.future.length) return;
    const entry = G.future.pop();
    entry.forEach((c) => {
      G.values[c[0]] = c[3];
      G.notes[c[0]] = c[4];
      if (c[5] && G.hinted.indexOf(c[0]) === -1) G.hinted.push(c[0]);
    });
    G.history.push(entry);
    G.selected = entry[0][0];
    afterChange();
  }

  function toggleNotes() {
    if (!usable()) return;
    noteMode = !noteMode;
    renderAll();
    saveGame();
  }

  function hint() {
    if (!usable()) return;
    const wrong = (i) => !isLocked(i) && G.values[i] !== G.solution[i];
    let t = G.selected;
    if (t < 0 || !wrong(t)) {
      const pool = [];
      for (let i = 0; i < 81; i++) if (wrong(i)) pool.push(i);
      t = pool.length ? pool[Math.floor(Math.random() * pool.length)] : -1;
    }
    if (t < 0) { toast('채울 칸이 없어요'); return; }
    const n = G.solution[t];
    const entry = transact((touch) => {
      touch(t);
      G.values[t] = n;
      G.notes[t] = 0;
    });
    if (entry) entry.forEach((c) => { if (c[0] === t) c[5] = 1; });
    if (G.hinted.indexOf(t) === -1) G.hinted.push(t);
    G.hints++;
    G.selected = t;
    afterChange();
  }

  /* ------------------------------------------------------------------ 완료 */
  function onWin() {
    G.completed = true;
    const secs = Math.floor(G.elapsed / 1000);
    const s = stats[G.difficulty];
    s.won++;
    s.streak++;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    s.total += secs;
    const record = s.best === null || secs < s.best;
    if (record) s.best = secs;
    saveStats();
    store.del(KEY.game);
    G.selected = -1;
    board.classList.add('win');
    renderAll();
    try { if (navigator.vibrate) navigator.vibrate([60, 40, 60]); } catch (e) { /* noop */ }

    $('#win-summary').innerHTML =
      '<b>' + DIFF_NAME[G.difficulty] + '</b> · 시간 <b>' + fmt(secs) + '</b>' +
      (record ? ' 🏅 <b>최단 기록!</b>' : '') +
      '<br>남은 하트 ' + G.lives + '/' + G.maxLives + ' · 힌트 ' + G.hints + '회';
    setTimeout(() => $('#dlg-win').showModal(), 650);
  }

  /* ------------------------------------------------------------------ 하트 / 게임 오버 */
  const HEART_PATH = 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';
  function heartSvg(lost) {
    return '<svg class="h' + (lost ? ' lost' : '') + '" viewBox="0 0 24 24" aria-hidden="true"><path d="' + HEART_PATH + '"/></svg>';
  }

  function renderLives() {
    const el = $('#g-lives');
    const left = G.lives, max = G.maxLives;
    const sig = left + '/' + max;
    if (el.dataset.sig === sig) return;
    el.dataset.sig = sig;
    el.setAttribute('aria-label', '남은 하트 ' + left + '개 (최대 ' + max + '개)');
    if (max > 5) {
      el.innerHTML = heartSvg(false) + '<b>' + left + '/' + max + '</b>';
    } else {
      let html = '';
      for (let k = 0; k < max; k++) html += heartSvg(k >= left);
      el.innerHTML = html;
    }
  }

  function pulseLives() {
    const el = $('#g-lives');
    el.classList.remove('hit');
    void el.offsetWidth;
    el.classList.add('hit');
    setTimeout(() => el.classList.remove('hit'), 450);
  }

  function onOver() {
    G.over = true;
    stats[G.difficulty].streak = 0;
    saveStats();
    store.del(KEY.game);
    G.selected = -1;
    renderAll();
    let filled = 0, total = 0;
    for (let i = 0; i < 81; i++) {
      if (G.puzzle[i] === 0) { total++; if (G.values[i] === G.solution[i]) filled++; }
    }
    $('#over-summary').innerHTML =
      '<b>' + DIFF_NAME[G.difficulty] + '</b> · 시간 <b>' + fmt(G.elapsed / 1000) + '</b>' +
      '<br>맞게 채운 칸 ' + filled + '/' + total + ' · 힌트 ' + G.hints + '회';
    try { if (navigator.vibrate) navigator.vibrate([80, 50, 80]); } catch (e) { /* noop */ }
    setTimeout(() => $('#dlg-over').showModal(), 500);
  }

  function retrySame() {
    $('#dlg-over').close();
    stats[G.difficulty].played++;
    saveStats();
    startFrom({
      difficulty: G.difficulty, puzzle: G.puzzle, solution: G.solution,
      values: G.puzzle.slice(), notes: new Array(81).fill(0),
      hinted: [], elapsed: 0, mistakes: 0, hints: 0, lives: settings.lives, maxLives: settings.lives,
      history: [], future: [], selected: -1, noteMode: false,
    });
    saveGame();
  }

  /* ------------------------------------------------------------------ 새 게임 */
  function busy(on) { $('#busy').hidden = !on; }

  async function newGame(diff) {
    const saved = loadSaved();
    if (saved) {
      const ok = await confirmDlg('진행 중인 게임이 있어요. 새 게임을 시작하면 지금 게임은 사라져요.', '새 게임');
      if (!ok) return;
      stats[saved.difficulty].streak = 0;   // 중도 포기는 연승 끊김
    }
    busy(true);
    await new Promise((r) => setTimeout(r, 40));
    let p;
    try {
      p = E.generate(diff);
    } catch (e) {
      busy(false);
      toast('퍼즐을 만들지 못했어요. 다시 시도해 주세요.');
      return;
    }
    stats[diff].played++;
    saveStats();
    startFrom({
      difficulty: diff, puzzle: p.puzzle, solution: p.solution,
      values: p.puzzle.slice(), notes: new Array(81).fill(0),
      hinted: [], elapsed: 0, mistakes: 0, hints: 0, lives: settings.lives, maxLives: settings.lives,
      history: [], future: [], selected: -1, noteMode: false,
    });
    saveGame();
    busy(false);
  }

  /* ------------------------------------------------------------------ 다이얼로그 / 토스트 */
  function confirmDlg(message, okText) {
    return new Promise((resolve) => {
      const d = $('#dlg-confirm');
      $('#confirm-msg').textContent = message;
      $('#confirm-ok').textContent = okText || '확인';
      d.returnValue = '';
      const onClose = () => { d.removeEventListener('close', onClose); resolve(d.returnValue === 'ok'); };
      d.addEventListener('close', onClose);
      d.showModal();
    });
  }

  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
  }

  function renderStats() {
    const rows = [
      ['시작한 게임', (s) => s.played],
      ['완성', (s) => s.won],
      ['승률', (s) => (s.played ? Math.round((s.won / s.played) * 100) + '%' : '-')],
      ['최단 시간', (s) => (s.best !== null ? fmt(s.best) : '-')],
      ['평균 시간', (s) => (s.won ? fmt(s.total / s.won) : '-')],
      ['현재 연승', (s) => s.streak],
      ['최고 연승', (s) => s.bestStreak],
    ];
    let html = '<table class="stats"><thead><tr><th></th>' +
      DIFFS.map((d) => '<th>' + DIFF_NAME[d] + '</th>').join('') + '</tr></thead><tbody>';
    rows.forEach((r) => {
      html += '<tr><th>' + r[0] + '</th>' + DIFFS.map((d) => '<td>' + r[1](stats[d]) + '</td>').join('') + '</tr>';
    });
    $('#stats-body').innerHTML = html + '</tbody></table>';
  }

  function renderSettings() {
    $('#lives-val').textContent = String(settings.lives);
    $('#lives-dec').disabled = settings.lives <= MIN_LIVES;
    $('#lives-inc').disabled = settings.lives >= MAX_LIVES;
    $('#set-errors').checked = settings.showErrors;
    $('#set-highlight').checked = settings.highlight;
    $$('#set-theme button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeValue === settings.theme)));
  }

  /* ------------------------------------------------------------------ 이벤트 연결 */
  function togglePause() {
    if (!G || G.completed) return;
    paused = !paused;
    $('#pause-overlay').hidden = !paused;
    $('#btn-pause').setAttribute('aria-label', paused ? '계속하기' : '일시정지');
    $('#ico-pause').innerHTML = paused
      ? '<polygon points="6 3 20 12 6 21 6 3"/>'
      : '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>';
    if (!paused) lastTs = performance.now();
    saveGame();
  }

  function bind() {
    $$('.diff').forEach((b) => b.addEventListener('click', () => newGame(b.dataset.diff)));
    $('#btn-continue').addEventListener('click', () => { const s = loadSaved(); if (s) startFrom(s); });
    $('#btn-stats').addEventListener('click', () => { renderStats(); $('#dlg-stats').showModal(); });
    const openSettings = () => { renderSettings(); $('#dlg-settings').showModal(); };
    $('#btn-settings').addEventListener('click', openSettings);
    $('#btn-game-settings').addEventListener('click', openSettings);
    $('#btn-theme-quick').addEventListener('click', () => {
      settings.theme = effectiveTheme() === 'dark' ? 'light' : 'dark';
      store.set(KEY.settings, settings);
      applyTheme();
      renderSettings();
    });
    const setLives = (n) => {
      settings.lives = Math.min(MAX_LIVES, Math.max(MIN_LIVES, n));
      store.set(KEY.settings, settings);
      renderSettings();
    };
    $('#lives-dec').addEventListener('click', () => setLives(settings.lives - 1));
    $('#lives-inc').addEventListener('click', () => setLives(settings.lives + 1));
    $('#btn-over-retry').addEventListener('click', retrySame);
    $('#btn-over-new').addEventListener('click', () => {
      const d = G ? G.difficulty : 'medium';
      $('#dlg-over').close();
      newGame(d);
    });
    $('#btn-over-menu').addEventListener('click', () => { $('#dlg-over').close(); goHome(); });

    $('#btn-reset-stats').addEventListener('click', async () => {
      const dlg = $('#dlg-stats');
      dlg.close();
      if (await confirmDlg('모든 기록을 지울까요? 되돌릴 수 없어요.', '초기화')) {
        DIFFS.forEach((d) => { stats[d] = blankStat(); });
        saveStats();
        renderHome();
        toast('기록을 초기화했어요');
      }
    });

    $('#btn-back').addEventListener('click', goHome);
    $('#btn-pause').addEventListener('click', togglePause);
    $('#btn-resume').addEventListener('click', togglePause);
    $('#btn-undo').addEventListener('click', undo);
    $('#btn-redo').addEventListener('click', redo);
    $('#btn-erase').addEventListener('click', erase);
    $('#btn-notes').addEventListener('click', toggleNotes);
    $('#btn-hint').addEventListener('click', hint);
    $('#btn-fast').addEventListener('change', (e) => setFast(e.target.checked));

    board.addEventListener('click', (e) => {
      const c = e.target.closest('.cell');
      if (c) tapCell(Number(c.dataset.i));
    });
    $('#numpad').addEventListener('click', (e) => {
      const b = e.target.closest('.num');
      if (!b) return;
      const n = Number(b.dataset.n);
      if (settings.fastInput) chooseNumber(n); else inputNumber(n);
    });

    // 설정
    const bindSwitch = (id, key) => $(id).addEventListener('change', (e) => {
      settings[key] = e.target.checked;
      store.set(KEY.settings, settings);
      if (G) { cells.forEach((c) => { c.sig = ''; }); renderAll(); }
    });
    bindSwitch('#set-errors', 'showErrors');
    bindSwitch('#set-highlight', 'highlight');
    $$('#set-theme button').forEach((b) => b.addEventListener('click', () => {
      settings.theme = b.dataset.themeValue;
      store.set(KEY.settings, settings);
      applyTheme();
      renderSettings();
    }));

    // 완료 다이얼로그
    $('#btn-win-again').addEventListener('click', () => {
      const d = G ? G.difficulty : 'medium';
      $('#dlg-win').close();
      newGame(d);
    });
    $('#btn-win-menu').addEventListener('click', () => { $('#dlg-win').close(); goHome(); });

    // 키보드
    document.addEventListener('keydown', (e) => {
      if (!G || $('#screen-game').hidden || document.querySelector('dialog[open]')) return;
      if (e.ctrlKey || e.metaKey) {
        if (e.code === 'KeyZ') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
        else if (e.code === 'KeyY') { e.preventDefault(); redo(); }
        return;
      }
      if (e.altKey) return;
      const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
      if (m) { inputNumber(Number(m[1])); return; }
      switch (e.code) {
        case 'Backspace': case 'Delete': case 'Digit0': case 'Numpad0': e.preventDefault(); erase(); return;
        case 'KeyN': toggleNotes(); return;
        case 'KeyF': setFast(!settings.fastInput); return;
        case 'KeyH': hint(); return;
        case 'KeyP': togglePause(); return;
        case 'ArrowUp': case 'ArrowDown': case 'ArrowLeft': case 'ArrowRight': {
          e.preventDefault();
          if (!usable()) return;
          let i = G.selected < 0 ? 40 : G.selected;
          let r = E.ROW[i], c = E.COL[i];
          if (G.selected >= 0) {
            if (e.code === 'ArrowUp') r = Math.max(0, r - 1);
            if (e.code === 'ArrowDown') r = Math.min(8, r + 1);
            if (e.code === 'ArrowLeft') c = Math.max(0, c - 1);
            if (e.code === 'ArrowRight') c = Math.min(8, c + 1);
          }
          select(r * 9 + c);
          return;
        }
        default:
      }
    });

    // 저장 시점 보장
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) saveGame();
      else lastTs = performance.now();
    });
    window.addEventListener('pagehide', saveGame);
  }

  /* ------------------------------------------------------------------ PWA: 설치 / 서비스 워커 */
  function setupInstall() {
    const box = $('#install-box');
    const btn = $('#btn-install');
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    if (standalone) return;

    let deferred = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferred = e;
      $('#install-text').textContent = '홈 화면에 설치하면 앱처럼 쓸 수 있어요.';
      btn.hidden = false;
      box.hidden = false;
    });
    btn.addEventListener('click', async () => {
      if (!deferred) return;
      deferred.prompt();
      try { await deferred.userChoice; } catch (e) { /* noop */ }
      deferred = null;
      box.hidden = true;
    });
    window.addEventListener('appinstalled', () => { box.hidden = true; });

    const ua = navigator.userAgent || '';
    const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    if (isIOS) {
      $('#install-text').textContent = '설치하려면 공유 버튼 → "홈 화면에 추가"를 눌러 주세요.';
      btn.hidden = true;
      box.hidden = false;
    }
  }

  function setupServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    let updating = false;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').then((reg) => {
        const offer = (worker) => {
          $('#update-bar').hidden = false;
          $('#btn-update').onclick = () => { updating = true; worker.postMessage('SKIP_WAITING'); };
        };
        if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          if (!w) return;
          w.addEventListener('statechange', () => {
            if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
          });
        });
      }).catch(() => { /* 로컬 file:// 등에서는 등록 불가 */ });
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (updating) { saveGame(); location.reload(); }
      });
    });
  }

  /* ------------------------------------------------------------------ 시작 */
  function init() {
    applyTheme();
    if (typeof window.matchMedia === 'function') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      if (mq && mq.addEventListener) mq.addEventListener('change', renderThemeIcon);
    }
    buildBoard();
    buildNumpad();
    bind();
    renderHome();
    showScreen('home');
    setupInstall();
    setupServiceWorker();
  }

  init();
})();
