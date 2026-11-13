// The team (devlog 06): a host that talks with the customer and a designer that works on the order. They coordinate
// through the job board on the order:
//   1. The customer writes. The host runs one short turn: it answers, and may give the designer a task (ask_designer).
//      Its reply is saved at once; the task becomes a queued job.
//   2. The designer picks up the job in the background and works on a copy of the order with the devlog 05 tools.
//      Each tool call adds a progress line to the job, saved as it happens, so the customer sees it live.
//   3. The designer ends with `report`. Its changes are committed as in devlog 05 (checker, conflict check and one
//      retry, one Undo group), and its report goes on the board and into the chat as a handoff line.
//   4. The report triggers the host again, which tells the customer what was done.
// Jobs for one order run one at a time, in order. The AI proposes; the rules decide.
import { check, price, type Candidate, type ChatMessage, type Order, type OrderEvent, type Snapshot } from '@cakeshop/shared';
import { AssistantFailure } from '../errors';
import { addChat, nowOf, sameSnapshot, snapshot, todayOf, type Clock } from '../orders/applyChange';
import type { OrderStore } from '../store';
import { designerInput, hostInput, panelNotesSinceAssistant, type Block, type Msg, type ProviderInput, type ToolResult } from './prompt';
import type { AssistantProvider } from './provider';
import { stripPrices } from './reply';
import { plainAck, type Assistant } from './service';
import { ASK_TOOL, DESIGNER_TOOLS, HOST_REPORT_TOOLS, HOST_TOOLS, REPLY_TOOL, REPORT_TOOL, runTool, type ToolRun } from './tools';

/** Tool calls the designer may make in one job (not counting report). After that it must report. */
export const MAX_TOOL_CALLS = 6;
const MAX_STEPS = MAX_TOOL_CALLS + 3;
/** The host's turn is short: it answers, and hands work over. */
const MAX_HOST_STEPS = 3;
const MAX_TASKS_PER_MESSAGE = 2;

type Words = { text: string; cantDo: string[]; suggestions: string[] };
type Report = { summary: string; questions: string[]; suggestions: string[] };

interface Attempt {
  start: Snapshot;
  /** The highest chat id when the attempt began, to find what the customer did meanwhile. */
  lastChatId: number;
  w: Order;
  newEvents: OrderEvent[];
  changes: string[];
  optionsShown: boolean;
  report: Report;
}

const strList = (v: unknown, max = 3): string[] =>
  (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []).slice(0, max);
const readReply = (input: Record<string, unknown>): Words => ({
  text: typeof input.text === 'string' ? input.text : '',
  cantDo: strList(input.cant_do, 5),
  suggestions: strList(input.suggestions),
});
const readReport = (input: Record<string, unknown>): Report => ({
  summary: typeof input.summary === 'string' ? input.summary : '',
  questions: strList(input.questions),
  suggestions: strList(input.suggestions),
});
const maxChatId = (o: Order) => o.chat.reduce((m, c) => Math.max(m, c.id), 0);

/** One progress line for the board, in the customer's words where possible. */
function progressLine(name: string, input: Record<string, unknown>, r: ToolRun, w: Order): string {
  if (!r.ok) return `refused: ${r.text.replace(/^Refused, nothing changed: /, '').replace(/\n[\s\S]*/, '').slice(0, 160)}`;
  if (r.change) return r.change;
  if (r.options) return `${w.options.length} option card${w.options.length === 1 ? '' : 's'} ready`;
  if (name === 'get_allowed_values') return `looked up the ${String(input.field)} choices`;
  if (name === 'check_design') return 'checked the design';
  return name;
}

export class TeamAssistant implements Assistant {
  /** Per order: the promise of the last queued job. Jobs chain on it, so they run one at a time. */
  private chains = new Map<string, Promise<void>>();

  constructor(
    private store: OrderStore,
    private clock: Clock,
    private provider: AssistantProvider,
  ) {}

  private async step(input: ProviderInput) {
    try {
      return await this.provider.step(input);
    } catch (err) {
      throw new AssistantFailure(err instanceof Error ? err.message : 'The assistant failed.');
    }
  }

  /** Strips prices from text the customer will read, and logs what was removed. */
  private cleaner(order: Order, now: string) {
    const removed: string[] = [];
    const clean = (s: string) => {
      const r = stripPrices(s);
      removed.push(...r.removed);
      return r.text;
    };
    const flush = () => {
      if (removed.length) order.events.push({ at: now, by: 'server', type: 'warning', text: `Removed a price from the assistant's words: ${removed.join(' | ')}` });
    };
    return { clean, flush };
  }

  // ---- The host ------------------------------------------------------------------------------------------------

  /** The host's turn for the customer's latest message. Throws AssistantFailure when it can't answer (nothing saved). */
  async message(orderId: string): Promise<void> {
    const order = this.store.get(orderId);
    if (!order || order.status !== 'DESIGNING') return;
    const input = hostInput(order, 'reply', this.clock);
    const messages: Msg[] = [...input.messages];
    const tasks: string[] = [];
    let words: Words | null = null;

    for (let step = 0; step < MAX_HOST_STEPS && !words; step++) {
      const res = await this.step({
        ...input,
        messages,
        tools: HOST_TOOLS,
        force: step === MAX_HOST_STEPS - 1 ? REPLY_TOOL : undefined,
        context: { ...input.context, step },
      });
      if (res.calls.length === 0) {
        words = { text: res.text, cantDo: [], suggestions: [] };
        break;
      }
      const said: Block[] = res.text ? [{ type: 'text', text: res.text }] : [];
      messages.push({ role: 'assistant', content: [...said, ...res.calls.map((c) => ({ type: 'tool_use' as const, ...c }))] });
      const out: Block[] = [];
      for (const call of res.calls) {
        if (call.name === REPLY_TOOL) {
          words = readReply(call.input);
          out.push({ type: 'tool_result', tool_use_id: call.id, content: 'Sent.' });
        } else if (call.name === ASK_TOOL) {
          const task = typeof call.input.task === 'string' ? call.input.task.trim().slice(0, 600) : '';
          if (!task) out.push({ type: 'tool_result', tool_use_id: call.id, content: 'Give the task in words.', is_error: true });
          else if (tasks.length >= MAX_TASKS_PER_MESSAGE)
            out.push({ type: 'tool_result', tool_use_id: call.id, content: 'Not queued: put everything for this message in one task.', is_error: true });
          else {
            tasks.push(task);
            out.push({ type: 'tool_result', tool_use_id: call.id, content: "Queued. The designer starts after your reply and reports back to you. Don't say it is done." });
          }
        } else out.push({ type: 'tool_result', tool_use_id: call.id, content: `Unknown tool "${call.name}".`, is_error: true });
      }
      messages.push({ role: 'user', content: out });
    }

    const fresh = this.store.get(orderId);
    if (!fresh || fresh.status !== 'DESIGNING') return;
    const now = nowOf(this.clock);
    const { clean, flush } = this.cleaner(fresh, now);
    const text = clean(words?.text ?? '') || (tasks.length ? "On it, I've asked our designer." : 'Sorry, could you say that another way?');
    addChat(fresh, { kind: 'assistant', from: 'host', text, cantDo: (words?.cantDo ?? []).map(clean).filter(Boolean), suggestions: (words?.suggestions ?? []).map(clean).filter(Boolean) }, now);
    const jobIds = tasks.map((task) => this.addJob(fresh, task, now));
    flush();
    this.store.save(fresh);
    for (const id of jobIds) this.enqueue(orderId, id);
  }

  /** A short acknowledgement of panel changes. No tools. Never throws: it falls back to a plain note. */
  async ack(orderId: string): Promise<void> {
    const order = this.store.get(orderId);
    if (!order || panelNotesSinceAssistant(order).length === 0) return;
    try {
      const res = await this.step({ ...hostInput(order, 'ack', this.clock), tools: [] });
      const fresh = this.store.get(orderId)!;
      const now = nowOf(this.clock);
      const { clean, flush } = this.cleaner(fresh, now);
      const total = fresh.quote ? ` Total $${fresh.quote.total}.` : '';
      addChat(fresh, { kind: 'assistant', from: 'host', text: `${clean(res.text) || 'Updated.'}${total}` }, now);
      flush();
      this.store.save(fresh);
    } catch {
      plainAck(this.store, orderId, this.clock);
    }
  }

  /** After a job: the host tells the customer what the designer did. Falls back to a plain note. */
  private async reportTurn(orderId: string, jobId: number, optionsTurn: boolean): Promise<void> {
    const order = this.store.get(orderId);
    const job = order?.jobs.find((j) => j.id === jobId);
    if (!order || !job) return;
    let words: Words | null = null;
    if (order.status === 'DESIGNING') {
      try {
        const res = await this.step({ ...hostInput(order, 'report', this.clock, job), tools: HOST_REPORT_TOOLS, force: REPLY_TOOL });
        const call = res.calls.find((c) => c.name === REPLY_TOOL);
        words = call ? readReply(call.input) : { text: res.text, cantDo: [], suggestions: [] };
      } catch {
        words = null;
      }
    }
    const fresh = this.store.get(orderId)!;
    const fj = fresh.jobs.find((j) => j.id === jobId)!;
    const now = nowOf(this.clock);
    if (fresh.status === 'DESIGNING') {
      const { clean, flush } = this.cleaner(fresh, now);
      const report = fj.report;
      const fallback =
        fj.status === 'failed' || !report
          ? "Sorry, our designer couldn't finish that, so nothing changed. Please try again."
          : report.changes.length
            ? `Done: ${report.changes.join('; ')}.`
            : report.summary;
      const msg: Omit<ChatMessage, 'id' | 'at'> = {
        kind: 'assistant',
        from: 'host',
        job: jobId,
        text: clean(words?.text ?? '') || fallback,
        cantDo: (words?.cantDo ?? []).map(clean).filter(Boolean),
        suggestions: (words ? words.suggestions : (report?.suggestions ?? [])).map(clean).filter(Boolean),
        ...(optionsTurn ? { optionsTurn: true } : {}),
      };
      addChat(fresh, msg, now);
      flush();
    }
    if (fj.status !== 'failed') fj.status = 'done';
    fj.finishedAt = now;
    this.store.save(fresh);
  }

  // ---- The job board -------------------------------------------------------------------------------------------

  private addJob(order: Order, task: string, now: string): number {
    const id = (order.jobs ?? []).reduce((m, j) => Math.max(m, j.id), 0) + 1;
    order.jobs = [...(order.jobs ?? []), { id, task, status: 'queued', progress: [], createdAt: now }];
    addChat(order, { kind: 'handoff', from: 'host', job: id, text: task }, now);
    return id;
  }

  private enqueue(orderId: string, jobId: number) {
    const prev = this.chains.get(orderId) ?? Promise.resolve();
    const next: Promise<void> = prev
      .then(() => this.runJob(orderId, jobId))
      .catch(() => undefined)
      .finally(() => {
        if (this.chains.get(orderId) === next) this.chains.delete(orderId);
      });
    this.chains.set(orderId, next);
  }

  async idle(orderId: string): Promise<void> {
    for (let p = this.chains.get(orderId); p; p = this.chains.get(orderId)) await p;
  }

  /** Changes one job on the stored order and saves it at once (read, change, save: no await in between). */
  private updateJob(orderId: string, jobId: number, fn: (j: Order['jobs'][number], o: Order) => void) {
    const o = this.store.get(orderId);
    const j = o?.jobs.find((x) => x.id === jobId);
    if (!o || !j) return;
    fn(j, o);
    this.store.save(o);
  }

  private fail(orderId: string, jobId: number, why: string) {
    this.updateJob(orderId, jobId, (j, o) => {
      const now = nowOf(this.clock);
      j.status = 'failed';
      j.progress.push(`stopped: ${why}`);
      j.finishedAt = now;
      o.events.push({ at: now, by: 'server', type: 'warning', text: `Designer job ${jobId} failed: ${why}` });
      addChat(o, { kind: 'handoff', from: 'designer', job: jobId, text: "I couldn't finish this job, so nothing changed." }, now);
    });
  }

  // ---- The designer --------------------------------------------------------------------------------------------

  private async runJob(orderId: string, jobId: number): Promise<void> {
    const order = this.store.get(orderId);
    if (!order?.jobs.some((j) => j.id === jobId)) return;
    if (order.status !== 'DESIGNING') {
      this.updateJob(orderId, jobId, (j) => {
        j.status = 'failed';
        j.progress.push('stopped: the order is no longer being designed');
        j.finishedAt = nowOf(this.clock);
      });
      return;
    }
    this.updateJob(orderId, jobId, (j) => {
      j.status = 'working';
    });
    let optionsTurn = false;
    try {
      optionsTurn = await this.work(orderId, jobId);
    } catch (err) {
      this.fail(orderId, jobId, err instanceof Error ? err.message.slice(0, 200) : 'the designer failed');
    }
    await this.reportTurn(orderId, jobId, optionsTurn);
  }

  /** Does the job and commits it. Returns whether option cards were shown. Throws when the designer fails. */
  private async work(orderId: string, jobId: number): Promise<boolean> {
    let a = await this.attempt(orderId, jobId, false);
    let stored = this.store.get(orderId);
    if (!a || !stored || stored.status !== 'DESIGNING') throw new Error('the order is no longer being designed');
    let dropped = false;
    let lost = false;

    // The customer changed the order while the designer was working: its changes were made on an old copy.
    if (a.changes.length && !sameSnapshot(snapshot(stored), a.start)) {
      const since = a.lastChatId;
      const theirs = stored.chat.filter((c) => c.id > since && c.kind === 'ui').map((c) => c.change ?? c.text);
      this.updateJob(orderId, jobId, (j) => j.progress.push('the customer changed the order meanwhile: looking again'));
      const b = await this.attempt(
        orderId,
        jobId,
        true,
        `(While you were working, the customer changed: ${theirs.join('; ') || 'the order'}. Your changes were not applied. Look at the current order before changing anything.)`,
      );
      stored = this.store.get(orderId);
      if (!b || !stored || stored.status !== 'DESIGNING') throw new Error('the order is no longer being designed');
      dropped = true;
      a = b;
      if (a.changes.length && !sameSnapshot(snapshot(stored), a.start)) {
        a = { ...a, changes: [], newEvents: a.newEvents.filter((e) => e.type !== 'change') };
        lost = true;
      }
    }
    return this.commit(stored, jobId, a, dropped, lost);
  }

  /** Runs the designer's tool loop on a copy of the stored order. Only progress lines are saved here. */
  private async attempt(orderId: string, jobId: number, retry: boolean, extra?: string): Promise<Attempt | null> {
    const order = this.store.get(orderId);
    const job = order?.jobs.find((j) => j.id === jobId);
    if (!order || !job || order.status !== 'DESIGNING') return null;
    const w = structuredClone(order);
    const firstEvent = w.events.length;
    const base = designerInput(order, job, this.clock, extra);
    const messages: Msg[] = [...base.messages];
    const results: ToolResult[] = [];
    const changes: string[] = [];
    let optionsShown = false;
    let calls = 0;
    let report: Report | null = null;

    for (let step = 0; step < MAX_STEPS && !report; step++) {
      const res = await this.step({
        ...base,
        messages,
        tools: DESIGNER_TOOLS,
        force: calls >= MAX_TOOL_CALLS ? REPORT_TOOL : undefined,
        context: { ...base.context, brief: w.brief, design: w.design, step, results, retry },
      });
      if (res.calls.length === 0) {
        report = { summary: res.text, questions: [], suggestions: [] };
        break;
      }
      const said: Block[] = res.text ? [{ type: 'text', text: res.text }] : [];
      messages.push({ role: 'assistant', content: [...said, ...res.calls.map((c) => ({ type: 'tool_use' as const, ...c }))] });
      const out: Block[] = [];
      for (const call of res.calls) {
        if (call.name === REPORT_TOOL) {
          report = readReport(call.input);
          out.push({ type: 'tool_result', tool_use_id: call.id, content: 'Sent to the host.' });
          continue;
        }
        if (calls >= MAX_TOOL_CALLS) {
          out.push({ type: 'tool_result', tool_use_id: call.id, content: 'Not run: the tool limit for this job is reached. Call report now.', is_error: true });
          continue;
        }
        calls++;
        const r = runTool(w, call.name, call.input, this.clock);
        results.push({ name: call.name, input: call.input, ok: r.ok, text: r.text });
        w.events.push({ at: nowOf(this.clock), by: 'assistant', type: 'tool', text: `job ${jobId}: ${call.name} ${JSON.stringify(call.input)} → ${r.ok ? '' : 'refused: '}${r.text.slice(0, 300)}` });
        if (r.change) changes.push(r.change);
        if (r.options) optionsShown = true;
        const line = progressLine(call.name, call.input, r, w);
        this.updateJob(orderId, jobId, (j) => j.progress.push(line));
        out.push({ type: 'tool_result', tool_use_id: call.id, content: r.text, ...(r.ok ? {} : { is_error: true }) });
      }
      messages.push({ role: 'user', content: out });
    }
    return {
      start: snapshot(order),
      lastChatId: maxChatId(order),
      w,
      newEvents: w.events.slice(firstEvent),
      changes,
      optionsShown,
      report: report ?? { summary: '', questions: [], suggestions: [] },
    };
  }

  /** Saves the designer's work, puts its report on the board and in the chat. Returns whether option cards were shown. */
  private commit(stored: Order, jobId: number, a: Attempt, dropped: boolean, lost: boolean): boolean {
    const now = nowOf(this.clock);
    const { clean, flush } = this.cleaner(stored, now);

    if (a.changes.length) {
      stored.brief = a.w.brief;
      stored.design = a.w.design;
      stored.quote = a.w.quote;
      stored.updatedAt = a.w.updatedAt;
    }
    stored.events.push(...a.newEvents);
    if (dropped) {
      stored.events.push({ at: now, by: 'server', type: 'warning', text: 'The customer changed the order during a job; the designer’s changes from that try were not applied.' });
      addChat(stored, { kind: 'system', text: 'You changed the order while the designer was working, so its changes from that moment were not applied.' }, now);
    }
    if (a.changes.length) {
      const group = `g${maxChatId(stored) + 1}`;
      const after = snapshot(stored);
      a.changes.forEach((change, i) =>
        addChat(stored, { kind: 'ui', text: `Designer changed ${change}`, change, by: 'assistant', group, job: jobId, ...(i === 0 ? { undo: { before: a.start, after } } : {}) }, now),
      );
    }

    let optionsTurn = false;
    if (a.optionsShown) {
      // Checked again against the stored brief, in case it moved, and priced by Pricing.
      const ok = a.w.options.filter((c) => check(c.design, stored.brief, todayOf(this.clock)).ok);
      if (ok.length) {
        stored.options = ok.map<Candidate>((c) => ({ ...c, title: clean(c.title), note: clean(c.note), quote: price(c.design, stored.brief) }));
        optionsTurn = true;
      }
    }

    const summary = lost
      ? 'The customer changed the order again while I was working, so I left it as they set it.'
      : clean(a.report.summary) || (a.changes.length ? `Done: ${a.changes.join('; ')}.` : optionsTurn ? 'Option cards are ready.' : 'Nothing changed.');
    const questions = a.report.questions.map(clean).filter(Boolean);
    const job = stored.jobs.find((j) => j.id === jobId);
    if (job) {
      job.status = 'reporting';
      job.report = { summary, questions, suggestions: a.report.suggestions.map(clean).filter(Boolean), changes: a.changes, dropped };
    }
    addChat(stored, { kind: 'handoff', from: 'designer', job: jobId, text: questions.length ? `${summary} Questions: ${questions.join(' ')}` : summary }, now);
    flush();
    this.store.save(stored);
    return optionsTurn;
  }
}
