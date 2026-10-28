/* 8비트 레트로 효과음 + 잔잔한 칩튠 배경음악. 음원 파일 없이 Web Audio로 직접 합성. */
(function () {
  'use strict';
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null, master = null, sfxBus = null, musicBus = null;
  const state = { sfx: true, music: false, volume: 0.6 };
  let musicOn = false, timer = 0, nextT = 0, step = 0;

  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const N = { C4: 60, D4: 62, E4: 64, F4: 65, G4: 67, A4: 69, B4: 71, C5: 72, D5: 74, E5: 76, F5: 77, G5: 79, A5: 81, B5: 83, C6: 84, E6: 88, G6: 91 };

  function ensure() {
    if (!AC) return false;
    if (!ctx) {
      try {
        ctx = new AC();
        master = ctx.createGain(); sfxBus = ctx.createGain(); musicBus = ctx.createGain();
        sfxBus.connect(master); musicBus.connect(master); master.connect(ctx.destination);
        musicBus.gain.value = 0;
        applyVolume();
      } catch (e) { ctx = null; return false; }
    }
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { /* noop */ } }
    return true;
  }
  function applyVolume() {
    if (!ctx) return;
    master.gain.value = Math.max(0, Math.min(1, state.volume)) * 0.7;
    sfxBus.gain.value = 1;
  }

  /* 한 음: 시작 시각, 길이, 파형, 음량, (선택) 끝 주파수로 미끄러짐 */
  function tone(bus, f, t, dur, type, vol, slideTo) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function seq(notes, gap, type, vol, dur) {
    if (!state.sfx || !ensure()) return;
    const t0 = ctx.currentTime + 0.01;
    notes.forEach((m, k) => tone(sfxBus, hz(m), t0 + k * gap, dur || gap * 1.4, type || 'square', vol || 0.16));
  }
  function one(m, dur, vol, type, slide) {
    if (!state.sfx || !ensure()) return;
    tone(sfxBus, hz(m), ctx.currentTime + 0.01, dur, type || 'square', vol || 0.16, slide ? hz(slide) : 0);
  }

  const SFX = {
    unlock() { ensure(); },
    tap() { one(N.G5, 0.05, 0.08); },                                   // 토글/숫자 고르기
    place() { one(N.E5, 0.07, 0.14); },                                  // 숫자 입력(채점 전)
    correct() { seq([N.E5, N.A5], 0.07, 'square', 0.15, 0.12); },        // 정답: 뾰로롱
    wrong() {                                                            // 오답: 뿌우
      if (!state.sfx || !ensure()) return;
      const t = ctx.currentTime + 0.01;
      tone(sfxBus, hz(52), t, 0.22, 'square', 0.17, hz(40));
      tone(sfxBus, hz(55), t + 0.02, 0.22, 'triangle', 0.14, hz(43));
    },
    note() { one(N.C6, 0.04, 0.07, 'triangle'); },                       // 메모
    erase() { one(N.A4, 0.08, 0.13, 'triangle', N.D4); },                // 지우기
    undo() { one(N.D5, 0.06, 0.12, 'triangle', N.A4); },
    redo() { one(N.A4, 0.06, 0.12, 'triangle', N.D5); },
    hint() { seq([N.C5, N.E5, N.G5, N.C6, N.E6], 0.06, 'square', 0.12, 0.1); },
    line() { seq([N.C5, N.E5, N.G5, N.C6], 0.07, 'square', 0.15, 0.12); },
    block() { seq([N.C5, N.E5, N.G5, N.C6, N.E6, N.G6], 0.07, 'square', 0.15, 0.14); },
    win() {                                                              // 클리어 팡파레
      if (!state.sfx || !ensure()) return;
      const t0 = ctx.currentTime + 0.05;
      [N.C5, N.C5, N.C5, N.G4, N.A4, N.C5, N.E5, N.G5, N.C6].forEach((m, k) => {
        const t = t0 + k * 0.11 + (k > 3 ? 0.08 : 0);
        tone(sfxBus, hz(m), t, k === 8 ? 0.6 : 0.14, 'square', 0.15);
        tone(sfxBus, hz(m - 12), t, k === 8 ? 0.6 : 0.14, 'triangle', 0.12);
      });
    },
    over() { seq([N.G4, N.E4, N.C4, 55, 48], 0.16, 'square', 0.14, 0.2); },  // 게임 오버: 하강

    setEnabled(on) { state.sfx = !!on; },
    setVolume(v) { state.volume = Math.max(0, Math.min(1, Number(v) || 0)); applyVolume(); }
  };

  /* ---------------- 배경음악: 느린 템포의 포근한 코드 아르페지오 ---------------- */
  // 한 마디 = 8스텝(8분음표). 4마디 반복: Cmaj7 - Am7 - Fmaj7 - G6
  const BARS = [
    { root: 48, ch: [60, 64, 67, 71] },
    { root: 45, ch: [57, 60, 64, 67] },
    { root: 41, ch: [53, 57, 60, 64] },
    { root: 43, ch: [55, 59, 62, 64] }
  ];
  const ARP = [0, 2, 1, 3, 2, 1, 3, 2];
  const TOP = [72, 74, 76, 79, 81];          // 가끔 얹는 느릿한 멜로디(펜타토닉)
  const STEP = 0.42;                          // 8분음표 길이(초) ≈ 71 BPM

  function schedule() {
    if (!ctx || !musicOn) return;
    while (nextT < ctx.currentTime + 0.6) {
      const bar = BARS[((step / 8) | 0) % 4], s = step % 8;
      if (nextT >= ctx.currentTime) {
        tone(musicBus, hz(bar.ch[ARP[s]]), nextT, STEP * 1.7, 'square', 0.035);
        if (s === 0 || s === 4) tone(musicBus, hz(bar.root), nextT, STEP * 3.6, 'triangle', 0.09);
        // 4스텝마다 가끔(결정적 패턴) 높은 음 하나
        if ((s === 2 || s === 6) && ((((step / 8) | 0) + s) % 3 !== 1)) {
          const m = TOP[(((step / 8) | 0) * 3 + s) % TOP.length];
          tone(musicBus, hz(m), nextT, STEP * 2.4, 'triangle', 0.05);
        }
      }
      nextT += STEP; step++;
    }
  }
  function musicStart() {
    if (!state.music || !ensure()) return;
    if (!musicOn) {
      musicOn = true; step = 0; nextT = ctx.currentTime + 0.1;
      timer = setInterval(schedule, 150);
    }
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.setTargetAtTime(1, ctx.currentTime, 0.4);
    schedule();
  }
  function musicStop() {
    if (!musicOn || !ctx) return;
    musicOn = false;
    clearInterval(timer); timer = 0;
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
  }

  window.Audio8 = {
    sfx: SFX,
    setMusicEnabled(on) { state.music = !!on; if (!on) musicStop(); },
    /* want=true면 재생, false면 정지 (설정이 꺼져 있으면 항상 정지) */
    music(want) { if (want && state.music) musicStart(); else musicStop(); },
    supported: !!AC
  };
})();
