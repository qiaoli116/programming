// What the routes need from the Design assistant. Phase C builds the real one (turn.ts) behind the provider seam.
import { addChat, nowOf, type Clock } from '../orders/applyChange';
import type { OrderStore } from '../store';

export interface Assistant {
  /** One assistant turn for the customer's latest message (already in the chat). Throws AssistantFailure when it can't answer. */
  message(orderId: string): Promise<void>;
  /** A short acknowledgement of the quick changes since the assistant last spoke. Never throws: it falls back to a plain note. */
  ack(orderId: string): Promise<void>;
}

/** Used when no provider is configured: the app runs, and each turn gets a plain reply. */
export class PlainAssistant implements Assistant {
  constructor(
    private store: OrderStore,
    private clock: Clock,
  ) {}

  async message(orderId: string): Promise<void> {
    const order = this.store.get(orderId);
    if (!order) return;
    addChat(
      order,
      { kind: 'assistant', text: "The design assistant isn't set up on this server, so I can't suggest designs. You can still change the design with the controls." },
      nowOf(this.clock),
    );
    this.store.save(order);
  }

  async ack(orderId: string): Promise<void> {
    plainAck(this.store, orderId, this.clock);
  }
}

/** The plain acknowledgement: what changed and the new total. Used when the AI can't answer. */
export function plainAck(store: OrderStore, orderId: string, clock: Clock): void {
  const order = store.get(orderId);
  if (!order) return;
  let lastAssistant = -1;
  order.chat.forEach((c, i) => {
    if (c.kind === 'assistant') lastAssistant = i;
  });
  const notes = order.chat.slice(lastAssistant + 1).filter((c) => c.kind === 'ui' && c.by !== 'assistant');
  if (notes.length === 0) return;
  const total = order.quote ? ` Total $${order.quote.total}.` : '';
  addChat(order, { kind: 'assistant', text: `Changed: ${notes.map((n) => n.change ?? n.text).join('; ')}.${total}` }, nowOf(clock));
  store.save(order);
}
