import { useState } from 'react';
import { DELIVERY_PRICE, SLOTS, labelOf, price, template, type DesignField, type OrderView } from '@cakeshop/shared';
import { ApiError, api } from '../api';
import { Cake, Seg, fmtDateLong, money } from '../ui';

type Props = { id: string; token: string; view: OrderView; onClose: () => void; onDone: (v: OrderView) => void };

const SPEC: DesignField[] = ['size', 'sponge', 'filling', 'finish', 'colour', 'topper', 'picture', 'message'];

export function ConfirmSheet({ id, token, view, onClose, onDone }: Props) {
  const design = view.design!;
  const [fulfilment, setFulfilment] = useState<'pickup' | 'delivery'>(view.brief.fulfilment === 'delivery' ? 'delivery' : 'pickup');
  const [slot, setSlot] = useState(view.brief.slot ?? SLOTS[0].id);
  const [name, setName] = useState(view.contact?.name ?? '');
  const [phone, setPhone] = useState(view.contact?.phone ?? '');
  const [email, setEmail] = useState(view.contact?.email ?? '');
  const [final, setFinal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = price(design, { ...view.brief, fulfilment }).total;
  const valid = name.trim() && phone.trim().length >= 6 && /.+@.+\..+/.test(email);
  const tpl = template(design.template);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      onDone(await api.confirm(id, token, { fulfilment, slot, contact: { name: name.trim(), phone: phone.trim(), email: email.trim() }, final: true }));
    } catch (e) {
      setError(e instanceof ApiError ? (e.reasons?.length ? e.reasons.map((r) => r.text).join(' ') : e.message) : 'Something went wrong. Try again.');
      setBusy(false);
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Review and confirm">
      <div className="modal">
        <div className="left">
          <Cake design={design} />
          <h3>{tpl?.name}</h3>
          <ul className="spec">
            {SPEC.map((f) => {
              const v = design[f as 'size'];
              return v ? (
                <li key={f}>
                  <span>{f === 'colour' ? 'Frosting' : f[0].toUpperCase() + f.slice(1)}</span> {f === 'message' || f === 'picture' ? String(v) : labelOf(f, String(v))}
                </li>
              ) : null;
            })}
            {design.decorations.length > 0 && <li><span>Decorations</span> {design.decorations.join(', ')}</li>}
            {design.glutenFree && <li><span>Dietary</span> Gluten-free</li>}
          </ul>
          <div className="tot big"><span>Total</span> <b>{money(total)}</b></div>
        </div>
        <div className="right">
          <h3>Pickup or delivery</h3>
          <Seg
            label="Pickup or delivery"
            value={fulfilment}
            onPick={(v) => setFulfilment(v as 'pickup' | 'delivery')}
            options={[
              { value: 'pickup', label: 'Pickup', ok: true },
              { value: 'delivery', label: 'Delivery', price: `+${money(DELIVERY_PRICE)}`, ok: true },
            ]}
          />
          <label className="lbl">Date</label>
          <div>{fmtDateLong(view.brief.date)}</div>
          <label className="lbl" htmlFor="slot">Time slot</label>
          <select id="slot" className="field" value={slot} onChange={(e) => setSlot(e.target.value)}>
            {SLOTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <label className="lbl" htmlFor="cname">Your name</label>
          <input id="cname" className="field" value={name} onChange={(e) => setName(e.target.value)} />
          <label className="lbl" htmlFor="cphone">Phone</label>
          <input id="cphone" className="field" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <label className="lbl" htmlFor="cemail">Email</label>
          <input id="cemail" className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <label className="final">
            <input type="checkbox" checked={final} onChange={(e) => setFinal(e.target.checked)} /> This design is final. I can't change it after I confirm.
          </label>
          {error && <div className="err" role="alert">✕ <span>{error}</span></div>}
          <div className="cta">
            <button className="btn primary lg" disabled={!final || !valid || busy} onClick={submit}>
              Confirm and pay · {money(total)}
            </button>
            <button className="btn" type="button" onClick={onClose} disabled={busy}>Back to design</button>
            <div className="small">Payment is simulated in this version. The baker approves before anything is made.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
