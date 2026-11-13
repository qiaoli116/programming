import { useEffect, useRef, useState } from 'react';
import { DIETARY_PRICE, allowedValues, line, occasion, optionValues, template, type DesignField, type Dietary, type OrderView } from '@cakeshop/shared';
import { ApiError, api } from '../api';
import { Badge, Bill, Cake, Chip, Seg, Swatches, Switch, TopBar, fmtDate, fmtTime, money, withPrices } from '../ui';
import { useXray } from '../xray/useXray';
import { ConfirmSheet } from './ConfirmSheet';

type Props = { id: string; token: string; view: OrderView; setView: (v: OrderView) => void };

const LABELS: Partial<Record<DesignField, string>> = {
  size: 'Size',
  colour: 'Frosting',
  sponge: 'Sponge',
  filling: 'Filling',
  finish: 'Finish',
  decorations: 'Decoration',
  topper: 'Topper',
  message: 'Message',
  picture: 'Picture',
  digits: 'Digits',
};
const ORDER: DesignField[] = ['size', 'colour', 'sponge', 'filling', 'finish', 'decorations', 'topper', 'picture', 'message', 'digits'];

export function Studio({ id, token, view, setView }: Props) {
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const ackTimer = useRef<number | undefined>(undefined);
  const thread = useRef<HTMLDivElement>(null);
  const xray = useXray(id, token);

  useEffect(() => () => window.clearTimeout(ackTimer.current), []);
  const openJob = view.jobs.find((j) => j.status === 'queued' || j.status === 'working' || j.status === 'reporting');
  useEffect(() => {
    thread.current?.scrollTo({ top: thread.current.scrollHeight });
  }, [view.chat.length, pending, openJob?.progress.length]);

  // While the designer works, the order is fetched again every 700 ms so its progress and changes show as they happen.
  // A poll that answers after the view changed is dropped, so it never puts an older order back on screen.
  useEffect(() => {
    if (!view.busy || pending) return;
    let live = true;
    const t = window.setTimeout(async () => {
      try {
        const next = await api.get(id, token);
        if (live) setView(next);
      } catch {
        /* the next poll tries again */
      }
    }, 700);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [view, pending, id, token, setView]);

  const design = view.design;
  const tpl = design ? template(design.template) : undefined;
  const ln = tpl ? line(tpl.line) : undefined;

  const fail = (e: unknown) => {
    if (e instanceof ApiError && e.reasons?.length) setError(`Not changed: ${e.reasons.map((r) => r.text).join(' ')}`);
    else setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
  };

  // A quick change: checked, priced and noted at once. The assistant acknowledges it two seconds after the last change.
  async function quick(call: () => Promise<OrderView>) {
    setError(null);
    try {
      setView(await call());
      window.clearTimeout(ackTimer.current);
      ackTimer.current = window.setTimeout(async () => {
        try {
          setView(await api.ack(id, token));
        } catch {
          /* the next refresh shows it */
        }
      }, 2000);
    } catch (e) {
      fail(e);
    }
  }
  const change = (field: string, value: unknown) => quick(() => api.design(id, token, field, value));
  const changeBrief = (field: string, value: unknown) => quick(() => api.brief(id, token, field, value));

  async function send(message: string) {
    const t = message.trim();
    if (!t || pending) return;
    window.clearTimeout(ackTimer.current);
    setPending(true);
    setError(null);
    setText('');
    setView({ ...view, chat: [...view.chat, { id: -1, kind: 'customer', text: t, at: new Date().toISOString() }] });
    try {
      setView(await api.message(id, token, t));
    } catch (e) {
      fail(e);
      setView(await api.get(id, token));
    } finally {
      setPending(false);
    }
  }

  async function undo(group: string) {
    setError(null);
    try {
      setView(await api.undo(id, token, group));
    } catch (e) {
      fail(e);
    }
  }

  async function choose(candidate: number) {
    setError(null);
    try {
      setView(await api.choose(id, token, candidate));
      setChosen(candidate);
    } catch (e) {
      fail(e);
    }
  }

  const lastOptions = view.chat.reduce((m, c, i) => (c.optionsTurn ? i : m), -1);
  const check = view.check;
  /** The panel pauses while the host answers or the designer works, so the customer and the designer don't race. */
  const locked = pending || view.busy;
  const canConfirm = !!design && !!check && check.ok && !locked;
  const total = view.quote?.total ?? 0;
  const brief = view.brief;
  const toggleDiet = (d: Dietary) => changeBrief('dietary', brief.dietary.includes(d) ? brief.dietary.filter((x) => x !== d) : [...brief.dietary, d]);

  function control(field: DesignField) {
    if (!design || !tpl || !ln || !tpl.changeable.includes(field) || !ln.groups.includes(field)) return null;
    if (field === 'message' && !ln.messageMax) return null;
    const label = LABELS[field]!;
    let body;
    if (field === 'message' || field === 'digits') {
      body = <TextControl key={`${field}-${design[field] ?? ''}`} label={label} value={design[field] ?? ''} max={field === 'message' ? ln.messageMax : 3} onCommit={(v) => change(field, v)} />;
    } else {
      const allowed = allowedValues(design, brief, field, view.today);
      const prices = new Map(optionValues(tpl.line, field).map((v) => [v.id, v.price]));
      const priceOf = (v: string) => {
        if (field === 'colour') return undefined;
        const p = prices.get(v);
        if (!p) return field === 'decorations' ? 'free' : undefined;
        return `${field === 'size' || field === 'topper' ? '' : '+'}${money(p)}`;
      };
      if (field === 'colour') {
        body = <Swatches value={design.colour} options={allowed.map((a) => ({ value: String(a.value), ok: a.ok, reason: a.reason }))} onPick={(v) => change('colour', v)} />;
      } else if (field === 'decorations') {
        body = (
          <div className="chips">
            {allowed.map((a) => {
              const on = design.decorations.includes(String(a.value));
              return (
                <Chip key={String(a.value)} on={on} off={!a.ok && !on} disabled={!a.ok && !on} title={a.reason} price={priceOf(String(a.value))}
                  onClick={() => change('decorations', on ? design.decorations.filter((d) => d !== a.value) : [...design.decorations, String(a.value)])}>
                  {a.label}
                </Chip>
              );
            })}
          </div>
        );
      } else if (field === 'topper') {
        body = (
          <div className="chips">
            {allowed.map((a) => (
              <Chip key={String(a.value)} on={design.topper === a.value} off={!a.ok} disabled={!a.ok} title={a.reason} price={priceOf(String(a.value))} onClick={() => change('topper', design.topper === a.value ? '' : a.value)}>
                {a.label}
              </Chip>
            ))}
          </div>
        );
      } else {
        body = (
          <Seg
            label={label}
            value={design[field as 'size'] as string | undefined}
            onPick={(v) => change(field, v)}
            options={allowed.map((a) => ({
              value: String(a.value),
              label: field === 'size' ? `${a.label} · serves ${ln.sizes.find((s) => s.id === a.value)?.serves}` : a.label,
              price: priceOf(String(a.value)),
              ok: a.ok,
              reason: a.reason,
            }))}
          />
        );
      }
    }
    return (
      <div className="qrow" key={field}>
        <span>{label}</span>
        {body}
      </div>
    );
  }

  const gf = design && ln?.glutenFree ? allowedValues(design, brief, 'glutenFree', view.today) : [];
  const gfNext = design ? gf.find((a) => a.value === !design.glutenFree) : undefined;

  return (
    <div className="page">
      <TopBar
        id={view.id}
        at={0}
        right={
          <>
            {xray.available && (
              <button type="button" className="btn sm" onClick={xray.open} title="Open a window that shows what the system is doing, while you use the studio">
                X-ray
              </button>
            )}
            <span className="link">Bookmark this page to come back</span>
          </>
        }
      />
      <div className="studio">
        <section className="chatcol" aria-label="Chat with the design assistant">
          <div className="chathead">
            <div className="agents">
              <div className="who">
                <div className="aiav" aria-hidden="true">✦</div>
                <div>
                  <b>Host</b>
                  <small>AI · talks with you</small>
                </div>
              </div>
              <div className="who">
                <div className="aiav des" aria-hidden="true">✎</div>
                <div>
                  <b>Designer</b>
                  <small aria-live="polite" data-testid="designer-status">
                    {openJob ? `AI · working: ${openJob.progress.at(-1) ?? 'starting'}` : 'AI · works on your cake, checked by our rules'}
                  </small>
                </div>
              </div>
            </div>
            {openJob ? <Badge tone="warn">● Working</Badge> : <Badge tone="ai">● Online</Badge>}
          </div>
          <div className="thread" ref={thread} aria-live="polite">
            {view.chat.map((c, i) => {
              if (c.kind === 'handoff') {
                const job = view.jobs.find((j) => j.id === c.job);
                const open = c.from === 'host' && job && job === openJob;
                return (
                  <div className={`handoff ${c.from}`} key={c.id} data-job={c.job}>
                    <div>
                      <b>{c.from === 'host' ? 'Host → Designer' : 'Designer → Host'}</b> {c.text}
                      {c.from === 'host' && job?.status === 'failed' && <span className="fail"> · failed</span>}
                    </div>
                    {open && (
                      <ul className="progress" aria-label={`Designer progress on job ${job.id}`}>
                        {job.progress.map((p, n) => (
                          <li key={n}>{p}</li>
                        ))}
                        <li className="now">{job.status === 'queued' ? 'waiting for the designer…' : job.status === 'reporting' ? 'reporting to the host…' : 'working…'}</li>
                      </ul>
                    )}
                  </div>
                );
              }
              if (c.kind === 'ui' && c.by === 'assistant')
                return (
                  <div className={`evt ai ${c.undone ? 'undone' : ''}`} key={c.id} data-group={c.group}>
                    ✎ <span>Designer changed <b>{c.change ?? c.text}</b></span> · {fmtTime(c.at)}
                    {c.undone && <span> · undone</span>}
                    {c.undo && !c.undone && (
                      <button type="button" className="linkbtn" disabled={locked} onClick={() => undo(c.group!)} aria-label={`Undo the designer's change: ${c.change ?? c.text}`}>
                        Undo
                      </button>
                    )}
                  </div>
                );
              if (c.kind === 'ui')
                return (
                  <div className="evt" key={c.id}>
                    {c.text.startsWith("Undid the assistant's change: ") ? (
                      <>↶ <span>You undid the designer's change <b>{c.text.slice(30)}</b></span></>
                    ) : (
                      <>✎ <span>You changed <b>{c.change ?? c.text}</b></span></>
                    )}{' '}
                    · {fmtTime(c.at)}
                  </div>
                );
              if (c.kind === 'system') return <div className="day" key={c.id}>{c.text}</div>;
              if (c.kind === 'customer')
                return (
                  <div className="m me" key={`${c.id}-${i}`}>
                    <div className="meta">You · {fmtTime(c.at)}</div>
                    <div className="bub">{c.text}</div>
                  </div>
                );
              return (
                <div className={`m ai ${i === lastOptions ? 'wide' : ''}`} key={c.id}>
                  <div className="meta">Host · {fmtTime(c.at)}</div>
                  <div className="bub">
                    {withPrices(c.text)}
                    {i === lastOptions && view.options.length > 0 && (
                      <div className="optrow" style={{ gridTemplateColumns: `repeat(${Math.min(view.options.length, 3)},1fr)` }}>
                        {view.options.map((o, n) => (
                          <div key={o.id} className={`oc ${chosen === o.id ? 'chosen' : chosen !== null ? 'dim' : ''}`}>
                            <Cake design={o.design} />
                            <div className="b">
                              <h5>
                                {String.fromCharCode(65 + n)} · {o.title} <span className="pr">{money(o.quote.total)}</span>
                              </h5>
                              <div className="nt">{o.note}</div>
                              {chosen === o.id ? (
                                <span className="tag">✓ Chosen</span>
                              ) : (
                                <button type="button" className="btn sm" disabled={locked} onClick={() => choose(o.id)}>
                                  Choose {String.fromCharCode(65 + n)}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {!!c.cantDo?.length && (
                      <div className="cant">
                        ✕ <span><b>Can't do:</b> {c.cantDo.join(' · ')}</span>
                      </div>
                    )}
                    {!!c.suggestions?.length && (
                      <div className="sugs">
                        {c.suggestions.map((s) => (
                          <button key={s} type="button" className="chip sug" disabled={pending} onClick={() => send(s)}>
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {pending && <div className="typing" role="status">The host is typing…</div>}
          </div>
          <form className="composer" onSubmit={(e) => { e.preventDefault(); send(text); }}>
            <div className="inp">
              <input aria-label="Message to the assistant" placeholder={pending ? 'The host is answering…' : view.busy ? 'The designer is working. You can still write…' : 'Ask for a change, or ask a question…'} value={text} disabled={pending} onChange={(e) => setText(e.target.value)} />
              <button className="btn primary sm" type="submit" disabled={pending || !text.trim()}>Send</button>
            </div>
            <div className="hint">Tip: ask the host for a change ("only 10 people", "make it purple") and our designer makes it, or use the panel on the right. Everyone sees every change.</div>
          </form>
        </section>

        <section className="designcol" aria-label="Your cake">
          <div className="dhead">
            <div>
              <h3>Your cake</h3>
              <small>{tpl ? `${tpl.name} · version ${design?.version ?? 1}` : 'No design yet. Pick one in the chat.'}</small>
            </div>
          </div>
          {view.busy ? (
            <div className="working" role="status">✎ The designer is working on your cake… the panel is paused until it's done.</div>
          ) : (
            pending && <div className="working" role="status">✦ The host is answering… the panel is paused for a moment.</div>
          )}
          <fieldset className="lock" disabled={locked}>
          <div className="brief" role="group" aria-label="Order details">
            <span className="lbl" style={{ marginRight: 2 }}>Order</span>
            <span className="chip">{occasion(brief.occasion).label}</span>
            <label className="chip">
              👥{' '}
              <input className="field" aria-label="Guests" type="number" min={1} max={500} defaultValue={brief.guests} key={brief.guests} style={{ width: 62 }}
                onBlur={(e) => Number(e.target.value) !== brief.guests && changeBrief('guests', Number(e.target.value))} />
            </label>
            <label className="chip">
              📅{' '}
              <input className="field" aria-label="Date" type="date" value={brief.date} onChange={(e) => e.target.value && changeBrief('date', e.target.value)} />
            </label>
            <Chip on={brief.dietary.includes('gluten-free')} onClick={() => toggleDiet('gluten-free')}>Gluten-free</Chip>
            <Chip on={brief.dietary.includes('vegan')} onClick={() => toggleDiet('vegan')}>Vegan</Chip>
            <Chip on={brief.fulfilment === 'delivery'} onClick={() => changeBrief('fulfilment', brief.fulfilment === 'delivery' ? 'pickup' : 'delivery')}>Delivery</Chip>
          </div>
          </fieldset>
          {design ? (
            <>
              <div className="stage">
                {check?.ok ? <Badge tone="ok">✓ We can make this</Badge> : <Badge tone="bad">✕ Needs a change</Badge>}
                <span className="vtag">v{design.version ?? 1}</span>
                <Cake design={design} />
                <div className="note">Picture drawn from your design. The real cake is made by hand and may vary slightly.</div>
              </div>
              {check && !check.ok && <div className="err" role="alert">✕ <span>{check.reasons.map((r) => r.text).join(' ')}</span></div>}
              {view.warning && <div className="err" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}>⚠ <span>{view.warning}</span></div>}
              <fieldset className="lock qc" disabled={locked}>
                <div className="hd">
                  <span className="lbl">✎ Quick changes</span>
                  <span style={{ fontSize: '.75rem', color: 'var(--faint)' }}>No need to ask the assistant</span>
                </div>
                {ORDER.map(control)}
                {ln?.glutenFree && (
                  <div className="qrow">
                    <span>Gluten-free</span>
                    <div className="swrow">
                      <Switch label="Gluten-free" on={design.glutenFree} disabled={!gfNext?.ok} onClick={() => change('glutenFree', !design.glutenFree)} />
                      <span style={{ fontSize: '.8rem', color: 'var(--muted)' }}>
                        +{money(DIETARY_PRICE['gluten-free'])}
                        {gfNext && !gfNext.ok ? ` · ${gfNext.reason}` : ''}
                      </span>
                    </div>
                  </div>
                )}
                {error && <div className="err" role="alert">✕ <span>{error}</span></div>}
                <div className="foot">
                  Each change is checked, priced and drawn at once, and noted in the chat so the assistant knows.
                  {ln && ` Up to ${ln.maxDecorations} decoration${ln.maxDecorations === 1 ? '' : 's'} on this cake.`}
                </div>
              </fieldset>
              {view.quote && <Bill lines={view.quote.lines} total={view.quote.total} />}
            </>
          ) : (
            <div className="stage empty">
              Your cake will appear here once you choose a design in the chat.
              {error && <div className="err inline" role="alert">✕ <span>{error}</span></div>}
            </div>
          )}
          <div className="cta">
            <button className="btn primary lg" disabled={!canConfirm} onClick={() => setConfirming(true)}>
              Review &amp; confirm{design ? ` · ${money(total)}` : ''}
            </button>
            <div className="small">You won't be charged until the baker approves your order.{brief.date && ` For ${fmtDate(brief.date)}.`}</div>
          </div>
        </section>
      </div>
      {confirming && design && <ConfirmSheet id={id} token={token} view={view} onClose={() => setConfirming(false)} onDone={setView} />}
    </div>
  );
}

function TextControl({ label, value, max, onCommit }: { label: string; value: string; max: number; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  const commit = () => v !== value && onCommit(v);
  return (
    <input className="field" aria-label={label} value={v} maxLength={max || undefined} style={{ padding: '6px 10px' }}
      onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
  );
}
