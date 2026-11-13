import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { labelOf, template } from '@cakeshop/shared';
import { ApiError, api, type BakerSummary } from '../api';
import { Badge, Cake, Logo, STATUS_BADGE, fmtDate, fmtDateLong, fmtTime, money } from '../ui';

type Summary = BakerSummary;
type Detail = Awaited<ReturnType<typeof api.baker.get>>;
const TABS = [
  { id: 'waiting', label: 'Waiting' },
  { id: 'approved', label: 'Approved' },
  { id: 'declined', label: 'Declined' },
] as const;

export function BakerLogin() {
  const nav = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.baker.login(password);
      nav('/baker');
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? 'That password is not right.' : 'Something went wrong. Try again.');
    }
  }
  return (
    <div className="page">
      <header className="app-top"><Logo kitchen /></header>
      <form className="login card" onSubmit={submit}>
        <h2 style={{ margin: 0 }}>Kitchen sign in</h2>
        <label className="lbl" htmlFor="pw">Password</label>
        <input id="pw" className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        {error && <div className="err" role="alert">✕ <span>{error}</span></div>}
        <button className="btn primary" type="submit" disabled={!password}>Sign in</button>
      </form>
    </div>
  );
}

export function BakerShell() {
  const { id } = useParams();
  const nav = useNavigate();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('waiting');
  const [orders, setOrders] = useState<Summary[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    api.baker.session().then(() => setAuthed(true), () => nav('/baker/login'));
  }, [nav]);

  const load = useCallback(async () => {
    const r = await api.baker.list(tab);
    setOrders([...r.orders].sort((a, b) => a.date.localeCompare(b.date)));
    setCounts(r.counts);
  }, [tab]);
  useEffect(() => {
    if (authed) load().catch(() => nav('/baker/login'));
  }, [authed, load, nav]);

  if (!authed) return <div className="empty">Loading…</div>;

  return (
    <div className="page">
      <header className="app-top">
        <Logo kitchen />
        <div className="spacer" />
        <button className="btn sm" onClick={async () => { await api.baker.logout(); nav('/baker/login'); }}>Sign out</button>
      </header>
      <div className="baker">
        <nav className="inbox" aria-label="Orders">
          <div className="hd">
            <h3>Orders</h3>
            <div className="tabs" role="tablist">
              {TABS.map((t) => (
                <span key={t.id} role="tab" tabIndex={0} aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''}
                  onClick={() => setTab(t.id)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setTab(t.id)}>
                  {t.label} {counts[t.id] ?? 0}
                </span>
              ))}
            </div>
          </div>
          {orders.length === 0 && <div className="empty">Nothing here.</div>}
          {orders.map((o) => (
            <div key={o.id} className={`item ${o.id === id ? 'on' : ''}`} role="link" tabIndex={0} data-order={o.id}
              onClick={() => nav(`/baker/${o.id}`)} onKeyDown={(e) => e.key === 'Enter' && nav(`/baker/${o.id}`)}>
              <div className="th">{o.design && <Cake design={o.design} />}</div>
              <div>
                <b>{o.id} · {o.template || 'No design'}</b>
                <div className="s">{o.name} · {fmtDate(o.date)}</div>
                <div className="r">
                  <Badge tone={STATUS_BADGE[o.status].tone}>{STATUS_BADGE[o.status].text}</Badge>
                  <b>{money(o.total)}</b>
                </div>
              </div>
            </div>
          ))}
        </nav>
        {id ? <OrderDetail key={id} id={id} onChanged={load} /> : <div className="empty">Pick an order on the left.</div>}
      </div>
    </div>
  );
}

function OrderDetail({ id, onChanged }: { id: string; onChanged: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => api.baker.get(id).then(setD, () => setError('Could not load this order.')), [id]);
  useEffect(() => { refresh(); }, [refresh]);

  if (!d) return <div className="empty">{error ?? 'Loading…'}</div>;
  const { order: o, check, bakeDay, sameDay } = d;
  const des = o.design;
  const waiting = o.status === 'AWAITING_BAKER';

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await refresh();
      onChanged();
      setDeclining(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.');
    }
  }

  return (
    <section className="detail" aria-label={`Order ${o.id}`}>
      <div className="top">
        <div>
          <h3>Order {o.id}</h3>
          <small>{o.contact?.name} · {o.contact?.phone} · {o.contact?.email}</small>
        </div>
        <Badge tone={STATUS_BADGE[o.status].tone}>{STATUS_BADGE[o.status].text}</Badge>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {des && <Cake design={des} />}
        {des && (
          <ul className="spec">
            <li><span>Cake</span> {template(des.template)?.name}</li>
            <li><span>Size</span> {labelOf('size', des.size)}</li>
            <li><span>Sponge</span> {labelOf('sponge', des.sponge)}</li>
            {des.message && <li><span>Message</span> {des.message}</li>}
            {des.glutenFree && <li><span>Dietary</span> Gluten-free</li>}
          </ul>
        )}
        <div className="tot big"><span>Total</span> <b>{(o.quote ? money(o.quote.total) : '')}</b></div>
        <div><b>{o.brief.fulfilment === 'delivery' ? 'Delivery' : 'Pickup'}</b> {fmtDateLong(o.brief.date)}{o.brief.slot ? `, ${o.brief.slot}` : ''}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <h4>Checks</h4>
          <ul className="checks">
            {check?.ok ? <li>This design passes every rule.</li> : check?.reasons.map((r) => <li key={r.code} className="you">{r.text}</li>)}
            <li>Bake day: {fmtDateLong(bakeDay)}</li>
          </ul>
        </div>
        <div>
          <h4>Same day</h4>
          <div className="daylist">
            {sameDay.map((s) => (
              <div key={s.id} className={s.id === o.id ? 'new' : ''}><span>{s.id} · {s.template}</span><span>{s.slot ?? ''}</span></div>
            ))}
            {sameDay.length === 0 && <div><span>Nothing else booked.</span></div>}
          </div>
        </div>
        <div>
          <h4>Chat and changes</h4>
          <div className="transcript">
            {o.chat.map((c) => (
              <div key={c.id} className={c.kind === 'ui' ? 'ev' : ''}>
                <b>{c.kind === 'customer' ? 'Customer' : c.kind === 'ui' ? (c.by === 'assistant' ? 'Assistant tool' : 'Panel') : c.kind === 'system' ? 'Note' : 'Assistant'}</b> {fmtTime(c.at)} {c.change ?? c.text}
              </div>
            ))}
            {o.events.map((e, i) => <div key={i} className="ev">{e.type} · {e.text}</div>)}
          </div>
        </div>
        {o.approval?.decision === 'declined' && <div className="err" role="status">✕ <span>Declined: {o.approval.reason}</span></div>}
        {waiting && (
          <div className="decide">
            {!declining ? (
              <>
                <button className="btn primary" disabled={!check?.ok} onClick={() => act(() => api.baker.approve(id))}>Approve order</button>
                <button className="btn" onClick={() => setDeclining(true)}>Decline…</button>
              </>
            ) : (
              <>
                <label className="lbl" htmlFor="why">Reason for the customer (required)</label>
                <textarea id="why" className="field" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
                <button className="btn danger" disabled={!reason.trim()} onClick={() => act(() => api.baker.decline(id, reason.trim()))}>Send decline</button>
                <button className="btn" onClick={() => setDeclining(false)}>Cancel</button>
              </>
            )}
          </div>
        )}
        {error && <div className="err" role="alert">✕ <span>{error}</span></div>}
      </div>
    </section>
  );
}
