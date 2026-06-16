// Shared test harness. Each test file runs in its own process (node --test),
// so we give each a fresh temp DB. db/index.js reads MANDATE_DB at import, so
// env MUST be set before the dynamic import here — never static-import db above.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function setupDb() {
  if (!process.env.MANDATE_DB) {
    process.env.MANDATE_DB = join(mkdtempSync(join(tmpdir(), 'beacon-test-')), 'test.db');
  }
  if (!process.env.MANDATE_SECRET_KEY) process.env.MANDATE_SECRET_KEY = 'test-secret-key';
  const dbmod = await import('../db/index.js');
  dbmod.ensureTables();
  const schema = await import('../db/schema.js');
  return { db: dbmod.db, sqlite: dbmod.sqlite, ensureTables: dbmod.ensureTables, schema };
}

// Replace global fetch with a handler; returns a restore function.
export function mockFetch(handler) {
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, opts) => handler(String(url), opts || {});
  return () => { globalThis.fetch = orig; };
}

export const jsonResponse = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

export const newId = (p = 'id_') => p + Math.random().toString(36).slice(2, 14);
