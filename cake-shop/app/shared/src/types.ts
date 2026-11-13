// Shared shapes: the design a customer builds, the brief, the order and its chat.

export type LineId = 'cupcakes' | 'mini' | 'round' | 'number' | 'sheet' | 'tiered';
export type OccasionId = 'kids' | 'adult' | 'wedding' | 'baby' | 'achievement' | 'office' | 'seasonal' | 'justbecause';
export type ColourId = 'white' | 'pink' | 'purple' | 'blue' | 'yellow' | 'mint' | 'chocolate' | 'black';
export type Dietary = 'gluten-free' | 'vegan';
export type Fulfilment = 'pickup' | 'delivery';

/** The design fields a customer (or the AI) can set. */
export type DesignField =
  | 'size'
  | 'sponge'
  | 'filling'
  | 'finish'
  | 'colour'
  | 'decorations'
  | 'topper'
  | 'message'
  | 'picture'
  | 'digits'
  | 'glutenFree'
  | 'vegan'
  | 'extras';

/** One customer's choices: a template plus option values. This is what an order holds and the kitchen makes. */
export interface Design {
  template: string;
  size: string;
  sponge: string;
  filling?: string;
  finish?: string;
  colour: ColourId;
  decorations: string[];
  topper?: string;
  message?: string;
  picture?: string;
  /** Characters on a number cake; also the number on "number candles". */
  digits?: string;
  glutenFree: boolean;
  vegan: boolean;
  extras: string[];
  /** Goes up by one on each saved change (set by the server). */
  version?: number;
}

/** What the start screen collects. Not part of the cake itself, but the checker reads it. */
export interface Brief {
  occasion: OccasionId;
  guests: number;
  /** Pickup or delivery date, YYYY-MM-DD. */
  date: string;
  dietary: Dietary[];
  fulfilment: Fulfilment;
  slot?: string;
}

export type ReasonLevel = 'shop' | 'line' | 'template' | 'option';

export interface Reason {
  code: string;
  field: string;
  level: ReasonLevel;
  /** A sentence for people. */
  text: string;
}

export type CheckResult = { ok: true } | { ok: false; reasons: Reason[] };

export interface QuoteLine {
  label: string;
  amount: number;
}
export interface Quote {
  lines: QuoteLine[];
  total: number;
}

export type Status = 'DESIGNING' | 'AWAITING_BAKER' | 'CONFIRMED' | 'DECLINED' | 'ABANDONED';

export type ChatKind = 'customer' | 'assistant' | 'ui' | 'system';

export interface ChatMessage {
  id: number;
  kind: ChatKind;
  text: string;
  at: string;
  /** For `ui` notes: the change in words ("colour white → purple"). */
  change?: string;
  /** For assistant messages: what the shop can't do, and short ideas the customer can click. */
  cantDo?: string[];
  suggestions?: string[];
  /** True when this assistant message presented the order's current options. */
  optionsTurn?: boolean;
  /** For `ui` notes: who made the change. Older notes have no `by` and were made in the panel. */
  by?: 'customer' | 'assistant';
  /** For the assistant's `ui` notes: the turn they belong to. Undo reverts a whole group. */
  group?: string;
  /** On the first note of an assistant group: the brief and design before and after the turn. */
  undo?: { before: Snapshot; after: Snapshot };
  /** Set on every note of a group that the customer undid. */
  undone?: boolean;
}

/** The parts of an order that the customer and the assistant both change. */
export interface Snapshot {
  brief: Brief;
  design: Design | null;
}

/** A design the assistant proposed, with its quote from Pricing and a note from the designer. */
export interface Candidate {
  id: number;
  title: string;
  note: string;
  design: Design;
  quote: Quote;
}

export interface Contact {
  name: string;
  phone: string;
  email: string;
}

export interface OrderEvent {
  at: string;
  by: 'customer' | 'assistant' | 'choose' | 'panel' | 'baker' | 'server';
  type: 'change' | 'status' | 'notice' | 'warning' | 'tool';
  text: string;
}

export interface Approval {
  decision: 'approved' | 'declined';
  reason?: string;
  at: string;
}

export interface Confirmation {
  paid: 'simulated';
  amount: number;
  at: string;
}

/** The order as the server stores it (the orders table, with JSON columns parsed). */
export interface Order {
  id: string;
  token: string;
  status: Status;
  brief: Brief;
  chat: ChatMessage[];
  options: Candidate[];
  design: Design | null;
  quote: Quote | null;
  contact: Contact | null;
  approval: Approval | null;
  confirmation: Confirmation | null;
  events: OrderEvent[];
  createdAt: string;
  updatedAt: string;
  lastCustomerAt: string;
}

/** The order as the customer may see it (no token, only notices from the event log). */
export type OrderView = Omit<Order, 'token' | 'events'> & {
  notices: OrderEvent[];
  /** The checker's verdict on the current design with the order's brief, as of `today` on the server. */
  check: CheckResult | null;
  /** A "serves fewer than your guests" warning, when it applies. */
  warning: string | null;
  today: string;
};

