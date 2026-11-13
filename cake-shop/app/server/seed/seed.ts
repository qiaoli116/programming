import { config } from '../src/config';
import { OrderStore, createDb } from '../src/store';
import { seedOrders } from './orders';

const db = createDb(config.dbFile);
const n = seedOrders(new OrderStore(db));
console.log(`Seeded ${n} demo orders into ${config.dbFile}`);
