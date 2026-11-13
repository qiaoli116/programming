// Components from app-design.html section 6, as small React pieces.
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { COLOURS, drawCake, type Design, type Status } from '@cakeshop/shared';

export const money = (n: number) => `$${n}`;

export function Cake({ design, className = '' }: { design: Design; className?: string }) {
  return <div className={`cake ${className}`} role="img" aria-label="Picture of the cake" dangerouslySetInnerHTML={{ __html: drawCake(design) }} />;
}

export function Badge({ tone, children }: { tone: 'ok' | 'bad' | 'warn' | 'ai' | 'muted'; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export const STATUS_BADGE: Record<Status, { tone: 'ok' | 'bad' | 'warn' | 'ai' | 'muted'; text: string }> = {
  DESIGNING: { tone: 'ai', text: '✎ Designing' },
  AWAITING_BAKER: { tone: 'warn', text: '● Waiting for the baker' },
  CONFIRMED: { tone: 'ok', text: '✓ Confirmed' },
  DECLINED: { tone: 'bad', text: '✕ Declined' },
  ABANDONED: { tone: 'muted', text: 'Closed · no reply for 7 days' },
};

export function Logo({ kitchen }: { kitchen?: boolean }) {
  return (
    <Link to={kitchen ? '/baker' : '/order/new'} className="logo" style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="mark">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M4 20h16M5 20v-6h14v6M7 14v-3h10v3M12 11V7M12 4.5v.5" />
        </svg>
      </div>
      Cake Order Desk
      {kitchen && <span className="badge muted" style={{ marginLeft: 4 }}>Kitchen</span>}
    </Link>
  );
}

const STEPS = ['Design', 'Confirm', 'Baker approval', 'Ready'];
export function Steps({ at }: { at: number }) {
  return (
    <div className="steps" aria-label="Progress">
      {STEPS.map((s, i) => (
        <span key={s} style={{ display: 'contents' }}>
          {i > 0 && <i className="sep" />}
          <span className={i < at ? 'done' : i === at ? 'on' : ''}>
            <b>{i < at ? '✓' : i + 1}</b>
            {s}
          </span>
        </span>
      ))}
    </div>
  );
}

export function TopBar({ id, at, right }: { id?: string; at?: number; right?: ReactNode }) {
  return (
    <header className="app-top">
      <Logo />
      {id && <Badge tone="muted">Order {id}</Badge>}
      <div className="spacer" />
      {at !== undefined && <Steps at={at} />}
      <div className="spacer" />
      {right}
    </header>
  );
}

export function Swatches({ value, options, onPick }: { value: string; options: { value: string; ok: boolean; reason?: string }[]; onPick: (v: string) => void }) {
  const name = COLOURS.find((c) => c.id === value)?.label ?? value;
  return (
    <div className="sws" role="group" aria-label="Frosting colour">
      {options.map((o) => {
        const c = COLOURS.find((x) => x.id === o.value)!;
        return (
          <button key={c.id} type="button" className={`sw ${o.value === value ? 'on' : ''}`} style={{ background: c.hex }} title={o.reason ?? c.label} aria-label={c.label} aria-pressed={o.value === value} disabled={!o.ok} onClick={() => onPick(c.id)} />
        );
      })}
      <span className="nm">{name}</span>
    </div>
  );
}

export function Seg({ label, options, value, onPick }: { label: string; value: string | undefined; options: { value: string; label: string; price?: string; ok: boolean; reason?: string }[]; onPick: (v: string) => void }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className={o.value === value ? 'on' : ''} disabled={!o.ok} title={o.reason} aria-pressed={o.value === value} onClick={() => onPick(o.value)}>
          {o.label} {o.price && <span className="p">{o.price}</span>}
          {!o.ok && ' ⓘ'}
        </button>
      ))}
    </div>
  );
}

export function Chip({ on, off, title, price, children, onClick, disabled }: { on?: boolean; off?: boolean; title?: string; price?: string; children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button type="button" className={`chip ${on ? 'on' : ''} ${off ? 'off' : ''}`} title={title} aria-pressed={on} disabled={disabled} onClick={onClick}>
      {on && '✓ '}
      {children} {price && <span className="p">{price}</span>}
    </button>
  );
}

export function Switch({ on, onClick, disabled, label }: { on: boolean; onClick: () => void; disabled?: boolean; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch ${on ? 'on' : ''}`} disabled={disabled} onClick={onClick} />;
}

export function Bill({ lines, total }: { lines: { label: string; amount: number }[]; total: number }) {
  return (
    <div className="bill" aria-label="Price">
      {lines.map((l) => (
        <div className="l" key={l.label}>
          <span>{l.label}</span>
          <span>{l.amount ? money(l.amount) : 'free'}</span>
        </div>
      ))}
      <div className="tot">
        <span>Total</span>
        <span>{money(total)}</span>
      </div>
    </div>
  );
}

/** Highlights amounts of money in the AI's text: they come from Pricing. */
export function withPrices(text: string): ReactNode[] {
  return text.split(/(\$\d[\d,.]*)/g).map((part, i) => (/^\$\d/.test(part) ? <span key={i} className="price">{part}</span> : part));
}

export const fmtDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
export const fmtDateLong = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
