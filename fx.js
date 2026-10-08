/* 축하 효과: 캔버스 폭죽 + 칸 물결. 외부 라이브러리 없음. */
(function () {
  'use strict';
  const COLORS = ['#ff4d6d', '#ffb703', '#3ddc97', '#4cc9f0', '#7b61ff', '#ff8fab', '#ffd166'];
  const reduce = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let canvas = null, ctx = null, parts = [], raf = 0, last = 0, dpr = 1;

  function ensure() {
    if (canvas) return !!ctx;
    canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:80';
    document.body.appendChild(canvas);
    try { ctx = canvas.getContext('2d'); } catch (e) { ctx = null; }
    return !!ctx;
  }
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
  }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick() { return COLORS[(Math.random() * COLORS.length) | 0]; }

  function loop(t) {
    const dt = Math.min(0.033, (t - last) / 1000 || 0.016);
    last = t;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);
    parts = parts.filter((p) => p.life > 0);
    for (const p of parts) {
      p.life -= dt;
      p.vy += p.g * dt;
      p.vx *= p.drag; p.vy *= p.drag;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.fade));
      ctx.fillStyle = p.c;
      if (p.spark) {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, 6.2832); ctx.fill();
      } else {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillRect(-p.s, -p.s * 0.5, p.s * 2, p.s); ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    if (parts.length) raf = requestAnimationFrame(loop);
    else { raf = 0; ctx.clearRect(0, 0, canvas.width, canvas.height); }
  }
  function start() {
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
  }

  /* 점에서 사방으로 터지는 폭죽 (spark) 또는 종이 조각 (confetti) */
  function burst(x, y, n, o) {
    if (reduce() || !ensure()) return;
    resize();
    o = o || {};
    const speed = o.speed || 320, confetti = !!o.confetti;
    const color = o.color;
    for (let k = 0; k < n; k++) {
      const a = o.cone ? rnd(-Math.PI / 2 - o.cone, -Math.PI / 2 + o.cone) : rnd(0, 6.2832);
      const v = rnd(speed * 0.35, speed);
      parts.push({
        x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        g: confetti ? 520 : 260, drag: confetti ? 0.985 : 0.97,
        life: rnd(0.9, 1.6) * (o.life || 1), fade: 0.5,
        c: color || pick(), s: confetti ? rnd(3, 6) : rnd(1.6, 3.2),
        rot: rnd(0, 6.28), vr: rnd(-12, 12), spark: !confetti
      });
    }
    start();
  }

  /* 화면 위쪽 여러 곳에서 연달아 터지는 대형 폭죽 */
  function fireworks(count, gap) {
    if (reduce()) return;
    const w = window.innerWidth, h = window.innerHeight;
    for (let k = 0; k < count; k++) {
      setTimeout(() => {
        const x = rnd(w * 0.15, w * 0.85), y = rnd(h * 0.12, h * 0.5);
        const c = pick();
        burst(x, y, 70, { speed: 360, color: c, life: 1.3 });
        burst(x, y, 24, { speed: 240, confetti: true, life: 1.4 });
      }, k * gap);
    }
    // 양쪽 아래에서 솟는 종이 조각
    setTimeout(() => {
      burst(0, h, 60, { confetti: true, speed: 900, cone: 0.5, life: 1.6 });
      burst(w, h, 60, { confetti: true, speed: 900, cone: 0.5, life: 1.6 });
    }, 150);
  }

  /* 칸들이 차례로 톡톡 튀어 오르는 물결 */
  function wave(els, perStep, color) {
    if (reduce()) return;
    els.forEach((el, k) => {
      if (!el || !el.animate) return;
      el.animate(
        [
          { transform: 'scale(1)', boxShadow: 'inset 0 0 0 0 ' + color },
          { transform: 'scale(1.18)', boxShadow: 'inset 0 0 0 999px ' + color, offset: 0.4 },
          { transform: 'scale(1)', boxShadow: 'inset 0 0 0 0 ' + color }
        ],
        { duration: 520, delay: k * perStep, easing: 'ease-out' }
      );
    });
  }

  window.FX = { burst: burst, fireworks: fireworks, wave: wave };
})();
