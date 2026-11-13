// The orders table (devlog 04 §4): one row per order, one JSON column per concern. No ORM.
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { Order } from '@cakeshop/shared';

export type Db = Database.Database;

export function createDb(file: string): Db {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  if (file !== ':memory:') db.pragma('journal_mode = WAL');
  migrate(db);
  return db;
}

export function migrate(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      status TEXT NOT NULL,
      brief TEXT NOT NULL,
      chat TEXT NOT NULL,
      options TEXT NOT NULL,
      design TEXT,
      quote TEXT,
      contact TEXT,
      approval TEXT,
      confirmation TEXT,
      events TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_customer_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS orders_status ON orders(status);
  `);
  // Devlog 06: the job board. Added to databases made before it.
  const cols = db.prepare(`PRAGMA table_info(orders)`).all() as { name: string }[];
  if (!cols.some((c) => c.name === 'jobs')) db.exec(`ALTER TABLE orders ADD COLUMN jobs TEXT NOT NULL DEFAULT '[]'`);
}

const FIRST_NEW_ID = 1046;
const json = (v: unknown) => (v === null || v === undefined ? null : JSON.stringify(v));
const parse = <T>(v: unknown): T | null => (typeof v === 'string' ? (JSON.parse(v) as T) : null);

type Row = Record<string, string | null>;

function fromRow(r: Row): Order {
  return {
    id: r.id as string,
    token: r.token as string,
    status: r.status as Order['status'],
    brief: parse(r.brief)!,
    chat: parse(r.chat) ?? [],
    options: parse(r.options) ?? [],
    design: parse(r.design),
    quote: parse(r.quote),
    contact: parse(r.contact),
    approval: parse(r.approval),
    confirmation: parse(r.confirmation),
    events: parse(r.events) ?? [],
    jobs: parse(r.jobs) ?? [],
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    lastCustomerAt: r.last_customer_at as string,
  };
}

export class OrderStore {
  constructor(private db: Db) {}

  /** Sequential ids: the seed uses C-1041 to C-1045, so new orders start at C-1046. */
  nextId(): string {
    const row = this.db.prepare(`SELECT MAX(CAST(SUBSTR(id, 3) AS INTEGER)) AS n FROM orders`).get() as { n: number | null };
    return `C-${Math.max(FIRST_NEW_ID, (row.n ?? 0) + 1)}`;
  }

  insert(o: Order): void {
    this.db
      .prepare(
        `INSERT INTO orders (id, token, status, brief, chat, options, design, quote, contact, approval, confirmation, events, jobs, created_at, updated_at, last_customer_at)
         VALUES (@id, @token, @status, @brief, @chat, @options, @design, @quote, @contact, @approval, @confirmation, @events, @jobs, @created_at, @updated_at, @last_customer_at)`,
      )
      .run(this.toParams(o));
  }

  save(o: Order): void {
    this.db
      .prepare(
        `UPDATE orders SET status=@status, brief=@brief, chat=@chat, options=@options, design=@design, quote=@quote, contact=@contact,
           approval=@approval, confirmation=@confirmation, events=@events, jobs=@jobs, updated_at=@updated_at, last_customer_at=@last_customer_at WHERE id=@id`,
      )
      .run(this.toParams(o));
  }

  get(id: string): Order | undefined {
    const row = this.db.prepare(`SELECT * FROM orders WHERE id = ?`).get(id) as Row | undefined;
    return row ? fromRow(row) : undefined;
  }

  list(statuses?: string[]): Order[] {
    const rows = this.db.prepare(`SELECT * FROM orders`).all() as Row[];
    const all = rows.map(fromRow);
    return statuses ? all.filter((o) => statuses.includes(o.status)) : all;
  }

  count(): number {
    return (this.db.prepare(`SELECT COUNT(*) AS n FROM orders`).get() as { n: number }).n;
  }

  private toParams(o: Order) {
    return {
      id: o.id,
      token: o.token,
      status: o.status,
      brief: json(o.brief),
      chat: json(o.chat),
      options: json(o.options),
      design: json(o.design),
      quote: json(o.quote),
      contact: json(o.contact),
      approval: json(o.approval),
      confirmation: json(o.confirmation),
      events: json(o.events),
      jobs: json(o.jobs ?? []),
      created_at: o.createdAt,
      updated_at: o.updatedAt,
      last_customer_at: o.lastCustomerAt,
    };
  }
}
