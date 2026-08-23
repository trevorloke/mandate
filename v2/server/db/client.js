// Database client. PGlite (embedded Postgres) by default — file-backed via
// MANDATE_V2_DATA, in-memory otherwise (tests). A hosted deployment sets
// DATABASE_URL and swaps in node-postgres behind the same tiny interface:
//   db.query(sql, params) → { rows }
//   db.transaction(async (tx) => ...) → serialized, rolls back on throw
import { PGlite } from '@electric-sql/pglite';
import { bootstrap } from './schema.js';

let dbPromise = null;

const create = async () => {
  if (process.env.DATABASE_URL) {
    // Production path: node-postgres pool. Kept out of v0.1 on purpose —
    // PGlite is real Postgres, so the SQL below is already the contract.
    throw new Error('DATABASE_URL support lands with deployment (v0.3); unset it for now.');
  }
  const dataDir = process.env.MANDATE_V2_DATA; // e.g. ./data/mandate — omit for in-memory
  const db = dataDir ? new PGlite(dataDir) : new PGlite();
  await bootstrap(db);
  return db;
};

export const getDb = () => {
  if (!dbPromise) dbPromise = create();
  return dbPromise;
};

// Tests only: swap in a fresh database.
export const _resetDbForTest = () => { dbPromise = null; };
