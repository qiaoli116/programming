import { useState } from 'react';
import { labelOf, template, type OrderView } from '@cakeshop/shared';
import { Badge, Cake, STATUS_BADGE, Steps, TopBar, fmtDateLong, fmtTime, money, withPrices } from '../ui';

const HEAD: Record<string, string> = {
  AWAITING_BAKER: 'Your order is with the baker',
  CONFIRMED: 'Your order is confirmed',
  DECLINED: "The baker can't make this one",
  ABANDONED: 'This order was closed',
};
const STEP: Record<string, number> = { AWAITING_BAKER: 2, CONFIRMED: 4, DECLINED: 2, ABANDONED: 0 };

export function StatusPage({ view }: { view: OrderView }) {
  const [chat, setChat] = useState(false);
  const badge = STATUS_BADGE[view.status];
  const d = view.design;
  const tpl = d ? template(d.template) : undefined;
  return (
    <div className="page">
      <TopBar id={view.id} at={STEP[view.status] ?? 0} />
      <main className="status">
        <Badge tone={badge.tone}>{badge.text}</Badge>
        <h1>{HEAD[view.status]}</h1>
        {view.status === 'AWAITING_BAKER' && <p>The baker checks every order by hand. You'll see the answer on this page.</p>}
        {view.status === 'CONFIRMED' && <p>Thank you{view.contact ? `, ${view.contact.name}` : ''}. Your cake is booked for {fmtDateLong(view.brief.date)}.</p>}
        {view.status === 'DECLINED' && (
          <div className="err" role="alert">
            ✕ <span><b>Reason from the baker:</b> {view.approval?.reason}</span>
          </div>
        )}
        {d && (
          <div className="card">
            <Cake design={d} />
            <div>
              <h3>{tpl?.name}</h3>
              <ul className="spec">
                <li><span>Size</span> {labelOf('size', d.size)}</li>
                <li><span>Sponge</span> {labelOf('sponge', d.sponge)}</li>
                {d.message && <li><span>Message</span> {d.message}</li>}
                <li><span>{view.brief.fulfilment === 'delivery' ? 'Delivery' : 'Pickup'}</span> {fmtDateLong(view.brief.date)}{view.brief.slot ? `, ${view.brief.slot}` : ''}</li>
              </ul>
              {view.quote && <div className="tot big"><span>Total</span> <b>{money(view.quote.total)}</b></div>}
            </div>
          </div>
        )}
        {view.notices.length > 0 && (
          <ul className="notices">
            {view.notices.map((n, i) => <li key={i}>{n.text} · {fmtTime(n.at)}</li>)}
          </ul>
        )}
        <button className="btn" type="button" onClick={() => setChat(!chat)}>{chat ? 'Hide the chat' : 'View the chat'}</button>
        {chat && (
          <div className="thread static">
            {view.chat.filter((c) => c.kind !== 'ui' && c.kind !== 'handoff').map((c) => (
              <div key={c.id} className={`m ${c.kind === 'customer' ? 'me' : 'ai'}`}>
                <div className="meta">{c.kind === 'customer' ? 'You' : 'Host'} · {fmtTime(c.at)}</div>
                <div className="bub">{withPrices(c.text)}</div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
