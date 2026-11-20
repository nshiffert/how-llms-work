import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { sfx } from '../engine/sfx';

/**
 * Shared building blocks for lessons and labs. Lessons should compose these
 * instead of inventing new controls, so every lab feels like the same product.
 * Colours: use `var(--hue)` for the active stage colour, and the tokens in
 * styles/app.css (--fg, --fg-2, --fg-3, --line, --panel, --good, --bad, --warn).
 */

/** Inline or block math. `<M>{'e^{x}'}</M>` or `<M block>{String.raw`\frac{a}{b}`}</M>` */
export function M({ children, block }: { children: string; block?: boolean }) {
  const html = useMemo(
    () => katex.renderToString(children, { displayMode: !!block, throwOnError: false }),
    [children, block],
  );
  return block ? (
    <div className="math-block" dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <span dangerouslySetInnerHTML={{ __html: html }} />
  );
}

export function Slider(props: {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  /** Formats the readout. Default: value as-is. */
  format?: (v: number) => string;
}) {
  const { label, value, min, max, step = 1, onChange, format } = props;
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="ctl">
      <span className="ctl-head">
        <span>{label}</span>
        <output>{format ? format(value) : value}</output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--pct': `${pct}%` } as CSSProperties}
        onChange={(e) => {
          const v = Number(e.target.value);
          sfx.tick((v - min) / (max - min));
          onChange(v);
        }}
      />
    </label>
  );
}

/** Segmented control for a small set of mutually exclusive choices. */
export function Seg<T extends string | number>(props: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="tablist">
      {props.options.map((o) => (
        <button
          key={String(o.value)}
          role="tab"
          aria-selected={o.value === props.value}
          className={o.value === props.value ? 'on' : ''}
          onClick={() => {
            sfx.tap();
            props.onChange(o.value);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, hot }: { label: ReactNode; value: ReactNode; hot?: boolean }) {
  return (
    <div className={`stat${hot ? ' hot' : ''}`}>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

export interface BarItem {
  label: string;
  value: number;
  /** Greyed out (e.g. filtered away). */
  off?: boolean;
  color?: string;
  /** Overrides the numeric readout. */
  text?: string;
}

/** Horizontal animated bars. Values are scaled against `max` (default: largest value, min 1e-9). */
export function Bars(props: { items: BarItem[]; max?: number; format?: (v: number) => string; labelWidth?: number }) {
  const max = props.max ?? Math.max(1e-9, ...props.items.map((i) => i.value));
  const fmt = props.format ?? ((v: number) => (v * 100).toFixed(1) + '%');
  return (
    <div className="bars" style={{ '--label-w': `${props.labelWidth ?? 84}px` } as CSSProperties}>
      {props.items.map((it, i) => (
        <div className={`bar-row${it.off ? ' off' : ''}`} key={it.label + i}>
          <span className="lab-t">{it.label}</span>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{ width: `${Math.max(0, Math.min(1, it.value / max)) * 100}%`, background: it.color }}
            />
          </div>
          <span className="val">{it.text ?? fmt(it.value)}</span>
        </div>
      ))}
    </div>
  );
}

const TOK_HUES = ['#46e0f0', '#a78bfa', '#f472b6', '#fbbf24', '#4ade80', '#60a5fa', '#fb923c'];

/** A token chip. `i` picks a stable colour; pass `color` to override. */
export function Tok({ children, i = 0, color, active, onClick, title }: {
  children: ReactNode; i?: number; color?: string; active?: boolean; onClick?: () => void; title?: string;
}) {
  const c = color ?? TOK_HUES[i % TOK_HUES.length];
  return (
    <span
      className="tok"
      title={title}
      onClick={onClick}
      style={{
        background: `color-mix(in srgb, ${c} ${active ? 38 : 16}%, transparent)`,
        borderColor: `color-mix(in srgb, ${c} ${active ? 90 : 40}%, transparent)`,
        color: '#fff',
        cursor: onClick ? 'pointer' : undefined,
      }}
    >
      {children}
    </span>
  );
}
export const tokHue = (i: number) => TOK_HUES[i % TOK_HUES.length];

export function Callout({ children, warn }: { children: ReactNode; warn?: boolean }) {
  return <div className={`callout${warn ? ' warn' : ''}`}>{children}</div>;
}

export function Code({ children }: { children: string }) {
  return (
    <pre>
      <code>{children.replace(/^\n/, '')}</code>
    </pre>
  );
}

export function Fold({ title, tag, defaultOpen, children }: { title: ReactNode; tag?: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className={`fold${open ? ' open' : ''}`}>
      <button onClick={() => { sfx.tap(); setOpen(!open); }} aria-expanded={open}>
        {title}
        {tag && <span className="tag">{tag}</span>}
        <span className="chev">▸</span>
      </button>
      {open && <div className="fold-body prose">{children}</div>}
    </div>
  );
}

/** Progress ring, 0..1. */
export function Ring({ value, size = 38, label, className = 'ring' }: { value: number; size?: number; label?: string; className?: string }) {
  const r = 15.5;
  const c = 2 * Math.PI * r;
  return (
    <svg className={className} viewBox="0 0 40 40" width={size} height={size} aria-hidden>
      <circle cx="20" cy="20" r={r} fill="none" stroke="var(--line-2)" strokeWidth="3.5" />
      <circle
        cx="20" cy="20" r={r} fill="none" stroke="var(--hue)" strokeWidth="3.5" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))}
        transform="rotate(-90 20 20)" style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(0.22,1,0.36,1)' }}
      />
      {label !== undefined && (
        <text x="20" y="20" textAnchor="middle" dominantBaseline="central" style={className === 'big-ring' ? { fontSize: 9 } : { fontSize: 10 }}>
          {label}
        </text>
      )}
    </svg>
  );
}

/** requestAnimationFrame loop. The callback gets seconds since mount and the frame delta. */
export function useRaf(cb: (t: number, dt: number) => void, active = true) {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    if (!active) return;
    let id = 0;
    let start = 0;
    let prev = 0;
    const loop = (now: number) => {
      if (!start) { start = now; prev = now; }
      ref.current((now - start) / 1000, Math.min(0.05, (now - prev) / 1000));
      prev = now;
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [active]);
}

/** Smoothly animates toward `target`. Good for readouts that should glide, not jump. */
export function useSpring(target: number, stiffness = 0.18) {
  const [v, setV] = useState(target);
  const cur = useRef(target);
  useEffect(() => {
    let id = 0;
    const step = () => {
      const d = target - cur.current;
      if (Math.abs(d) < 1e-4) { cur.current = target; setV(target); return; }
      cur.current += d * stiffness;
      setV(cur.current);
      id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [target, stiffness]);
  return v;
}

// ---- Small math helpers used across labs ----
export function softmax(logits: number[], T = 1): number[] {
  const m = Math.max(...logits);
  const ex = logits.map((l) => Math.exp((l - m) / T));
  const s = ex.reduce((a, b) => a + b, 0);
  return ex.map((e) => e / s);
}
export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const fmt = (x: number, d = 2) => x.toFixed(d);
export const pct = (x: number, d = 1) => (x * 100).toFixed(d) + '%';
/** Deterministic PRNG so labs look the same on every visit. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
