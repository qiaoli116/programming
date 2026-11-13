import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { OCCASIONS, defaultDesign, fittingSize, line, price, suggestTemplates, template, type Brief, type Dietary, type OccasionId } from '@cakeshop/shared';
import { ApiError, api } from '../api';
import { Cake, TopBar, money } from '../ui';

const EMOJI: Record<OccasionId, string> = { kids: '🎈', adult: '🥂', wedding: '💍', baby: '🍼', achievement: '🎓', office: '🏢', seasonal: '❄️', justbecause: '💝' };

const isoPlus = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function Start() {
  const nav = useNavigate();
  const [occasion, setOccasion] = useState<OccasionId>('kids');
  const [guests, setGuests] = useState(20);
  const [date, setDate] = useState(isoPlus(8));
  const [dietary, setDietary] = useState<'' | Dietary>('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const brief: Brief = useMemo(() => ({ occasion, guests, date, dietary: dietary ? [dietary] : [], fulfilment: 'pickup' }), [occasion, guests, date, dietary]);
  const popular = useMemo(() => suggestTemplates(brief).slice(0, 4), [brief]);
  const occLabel = OCCASIONS.find((o) => o.id === occasion)!.label;

  async function start(tpl?: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await api.create(brief, text.trim() || undefined, tpl);
      nav(`/order/${res.id}?t=${res.token}`);
    } catch (e) {
      setBusy(false);
      setError(e instanceof ApiError ? [e.message, ...(e.reasons ?? []).map((r) => r.text).filter((t) => t !== e.message)].join(' ') : 'Something went wrong.');
    }
  }

  return (
    <div className="page">
      <TopBar />
      <main className="start">
        <div>
          <div className="lbl" style={{ marginBottom: 8 }}>New order</div>
          <h1 style={{ fontSize: '2.1rem', lineHeight: 1.15, margin: '0 0 10px', letterSpacing: '-.02em' }}>Let's design your cake together.</h1>
          <p className="intro">Tell us the occasion and our design assistant will show you cakes that fit, with a picture and the exact price for each.</p>
          <div className="lbl" style={{ marginBottom: 8 }}>1 · What's the occasion?</div>
          <div className="occ" role="group" aria-label="Occasion">
            {OCCASIONS.map((o) => (
              <button key={o.id} type="button" className={o.id === occasion ? 'on' : ''} aria-pressed={o.id === occasion} onClick={() => setOccasion(o.id)}>
                <span className="e" aria-hidden="true">{EMOJI[o.id]}</span>
                {o.label}
              </button>
            ))}
          </div>
          <div className="lbl" style={{ marginBottom: 8 }}>2 · The basics</div>
          <div className="facts">
            <label className="f">Guests<input className="field" type="number" min={1} max={500} value={guests} onChange={(e) => setGuests(Number(e.target.value))} /></label>
            <label className="f">Pickup date<input className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
            <label className="f">Dietary
              <select className="field" value={dietary} onChange={(e) => setDietary(e.target.value as '' | Dietary)}>
                <option value="">None</option>
                <option value="gluten-free">Gluten-free</option>
                <option value="vegan">Vegan</option>
              </select>
            </label>
          </div>
          <div className="askbox">
            <textarea aria-label="Your idea" placeholder="Your idea (optional): themes, colours, a message…" value={text} onChange={(e) => setText(e.target.value)} />
            <div className="row">
              <span style={{ fontSize: '.75rem', color: 'var(--faint)' }}>3 · Your idea (optional)</span>
              <button className="btn primary" disabled={busy} onClick={() => start()}>{busy ? 'Starting…' : 'Start designing →'}</button>
            </div>
          </div>
          {error && <div className="err inline" role="alert">✕ <span>{error}</span></div>}
          <div className="trust"><span>Every cake we show, we can make</span><span>Exact prices, no surprises</span><span>A baker approves every order</span></div>
        </div>
        <div>
          <div className="lbl" style={{ marginBottom: 10 }}>Popular for {occLabel.toLowerCase()} · serves {guests}+{dietary ? `, ${dietary}` : ''}</div>
          <div className="popular">
            {popular.length === 0 && <div className="empty" style={{ gridColumn: '1 / -1' }}>No ready-made designs fit that. Describe your idea and the assistant will help.</div>}
            {popular.map((t) => {
              const size = fittingSize(t.id, guests);
              const d = defaultDesign(t.id, brief);
              const sized = { ...d, size };
              const ln = line(t.line);
              const sz = ln.sizes.find((s) => s.id === size)!;
              return (
                <button key={t.id} type="button" className="tcard" disabled={busy} onClick={() => start(t.id)} aria-label={`${template(t.id)!.name}, start with this`}>
                  <Cake design={sized} className="" />
                  <div className="b">
                    <h4>{t.name} <span>from {money(price(sized, brief).total)}</span></h4>
                    <div className="t">{sz.label} · serves {sz.serves}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
