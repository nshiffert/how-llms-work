import { useEffect, useRef } from 'react';

// Live self-attention visualization for the landing hero. Ported from the
// Home.dc.html design: tokens are laid out as chips, a query token cycles, and
// quadratic-bezier curves to every key are drawn with width/opacity ∝ the
// (softmaxed) attention weight, with particles flowing along them.

const TOKENS = [
  'Every', 'token', 'rewrites', 'itself', 'as', 'a', 'blend',
  'of', 'the', 'tokens', 'it', 'attends', 'to',
];

export default function HeroAttentionViz() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const N = TOKENS.length;

    // Random-but-locality-biased attention matrix, row-softmaxed.
    const W: number[][] = [];
    for (let i = 0; i < N; i++) {
      const row: number[] = [];
      let s = 0;
      for (let j = 0; j < N; j++) {
        const v = Math.exp(Math.random() * 2.4 - Math.abs(i - j) * 0.22);
        row.push(v);
        s += v;
      }
      for (let j = 0; j < N; j++) row[j] /= s;
      W.push(row);
    }

    let rects: { x: number; y: number; w: number; h: number; cx: number; cy: number; text: string }[] = [];
    let w = 0, h = 0, dpr = 1;

    const layout = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      if (!w || !h) return;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = '600 13px "IBM Plex Mono", monospace';
      const padX = 26, padTop = 64, lh = 44, chPad = 11, gap = 9;
      let x = padX, y = padTop;
      rects = [];
      for (let i = 0; i < N; i++) {
        const tw = ctx.measureText(TOKENS[i]).width + chPad * 2;
        if (x + tw > w - padX) { x = padX; y += lh; }
        rects.push({ x, y, w: tw, h: 28, cx: x + tw / 2, cy: y + 14, text: TOKENS[i] });
        x += tw + gap;
      }
    };
    layout();
    const ro = new ResizeObserver(() => layout());
    ro.observe(canvas);

    const rr = (c: CanvasRenderingContext2D, x: number, y: number, ww: number, hh: number, r: number) => {
      c.moveTo(x + r, y);
      c.arcTo(x + ww, y, x + ww, y + hh, r);
      c.arcTo(x + ww, y + hh, x, y + hh, r);
      c.arcTo(x, y + hh, x, y, r);
      c.arcTo(x, y, x + ww, y, r);
    };

    let q = 0, phase = 1, last = performance.now(), acc = 0;
    const interval = 2400;
    let raf = 0;

    const draw = (now: number) => {
      const dt = Math.min(now - last, 60);
      last = now;
      acc += dt;
      phase = Math.min(1, phase + dt / 650);
      if (acc > interval) { acc = 0; q = (q + 1) % N; phase = 0; }
      if (!w || !h || !rects.length) { raf = requestAnimationFrame(draw); return; }

      ctx.clearRect(0, 0, w, h);

      // dotted grid
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      for (let gx = 18; gx < w; gx += 26)
        for (let gy = 18; gy < h; gy += 26) { ctx.beginPath(); ctx.arc(gx, gy, 1, 0, 7); ctx.fill(); }

      const qr = rects[q];
      if (!qr) { raf = requestAnimationFrame(draw); return; }
      const t = now / 1000;

      // attention curves + flowing particles
      for (let j = 0; j < N; j++) {
        const kr = rects[j];
        const wgt = W[q][j];
        const a = wgt * phase;
        if (a < 0.015) continue;
        const my = Math.max(qr.cy, kr.cy) + 56, mx = (qr.cx + kr.cx) / 2;
        ctx.beginPath();
        ctx.moveTo(qr.cx, qr.cy + 15);
        ctx.quadraticCurveTo(mx, my, kr.cx, kr.cy + 15);
        ctx.strokeStyle = 'rgba(56,217,230,' + (0.1 + a * 0.85) + ')';
        ctx.lineWidth = 0.6 + wgt * 5.5;
        ctx.stroke();
        const pp = (t * 0.55 + j * 0.12) % 1;
        const ix = (1 - pp) * (1 - pp) * qr.cx + 2 * (1 - pp) * pp * mx + pp * pp * kr.cx;
        const iy = (1 - pp) * (1 - pp) * (qr.cy + 15) + 2 * (1 - pp) * pp * my + pp * pp * (kr.cy + 15);
        ctx.beginPath();
        ctx.arc(ix, iy, 1.4 + wgt * 2.2, 0, 7);
        ctx.fillStyle = 'rgba(240,110,196,' + (0.25 + a) + ')';
        ctx.fill();
      }

      // token chips
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.font = '600 13px "IBM Plex Mono", monospace';
      for (let i = 0; i < N; i++) {
        const r = rects[i];
        const isQ = i === q;
        const wgt = W[q][i] * phase;
        ctx.beginPath();
        rr(ctx, r.x, r.y, r.w, r.h, 7);
        if (isQ) {
          ctx.fillStyle = 'rgba(56,217,230,0.18)'; ctx.fill();
          ctx.strokeStyle = 'rgba(56,217,230,0.95)'; ctx.lineWidth = 1.4; ctx.stroke();
        } else {
          ctx.fillStyle = 'rgba(240,110,196,' + (0.04 + wgt * 0.55) + ')'; ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,' + (0.07 + wgt * 0.3) + ')'; ctx.lineWidth = 1; ctx.stroke();
        }
        ctx.fillStyle = isQ ? '#cfeef2' : 'rgba(232,234,240,' + (0.5 + wgt * 0.5) + ')';
        ctx.fillText(r.text, r.cx, r.cy + 1);
      }

      // labels
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.font = '600 12px "IBM Plex Mono", monospace';
      ctx.fillStyle = 'rgba(56,217,230,0.9)';
      ctx.fillText('softmax( Q·Kᵀ / √dₖ )', 26, 30);
      ctx.fillStyle = 'rgba(139,144,160,0.85)';
      ctx.fillText('query → token[' + q + ']  "' + TOKENS[q] + '"', 26, 48);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  // Absolute + inset:0 so the canvas sizes against the position:relative hero
  // container, not the inline <astro-island> wrapper Astro injects (which has no
  // height — a percentage height there would collapse the canvas to zero).
  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, display: 'block', width: '100%', height: '100%' }}
    />
  );
}
