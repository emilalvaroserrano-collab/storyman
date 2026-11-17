import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Pool } from 'pg';

type Row = Record<string, unknown>;
export type SqlExecutor = (sql: string, values?: unknown[]) => Promise<{ rows: Row[]; changes: number }>;
type DatabaseState = { sqlite?: DatabaseSync; pool?: Pool; ready?: Promise<void>; operations?: Promise<unknown> };
const state = globalThis as typeof globalThis & { storymanDatabase?: DatabaseState };
const database = state.storymanDatabase ??= {};
export const dataDirectory = resolve(/* turbopackIgnore: true */ process.env.STORYMAN_DATA_DIR || './data');
export const databaseKind = process.env.DATABASE_URL ? 'PostgreSQL' : 'SQLite · local';
const postgresSql = (sql: string) => { let index = 0; return sql.replace(/\?/g, () => `$${++index}`); };
async function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const result = (database.operations || Promise.resolve()).catch(() => {}).then(operation);
  database.operations = result.catch(() => {});
  return result;
}
async function raw(sql: string, values: unknown[] = []): Promise<{ rows: Row[]; changes: number }> {
  const params = values.map(v => v === undefined ? null : v);
  if (database.pool) { const result = await database.pool.query(postgresSql(sql), params); return { rows: result.rows, changes: result.rowCount || 0 }; }
  const statement = database.sqlite!.prepare(sql);
  if (/^\s*(SELECT|WITH|PRAGMA)|\bRETURNING\b/i.test(sql)) { const rows = statement.all(...params as (string | number | null)[]) as Row[]; return { rows, changes: rows.length }; }
  const result = statement.run(...params as (string | number | null)[]);
  return { rows: [], changes: Number(result.changes) };
}
export async function initializeDatabase(): Promise<void> {
  if (database.ready) return database.ready;
  database.ready = (async () => {
    mkdirSync(dataDirectory, { recursive: true });
    if (process.env.DATABASE_URL) database.pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
    else { database.sqlite = new DatabaseSync(resolve(dataDirectory, 'storyman.sqlite')); database.sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;'); }
    await raw(`CREATE TABLE IF NOT EXISTS app_records (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    await raw(`CREATE TABLE IF NOT EXISTS story_jobs (id TEXT PRIMARY KEY, idempotency_key TEXT UNIQUE NOT NULL, status TEXT NOT NULL, trigger_type TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, lease_until TEXT, lease_token TEXT, attempts INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL)`);
    if (database.pool) await raw('ALTER TABLE story_jobs ADD COLUMN IF NOT EXISTS lease_token TEXT');
    else if (!(await raw('PRAGMA table_info(story_jobs)')).rows.some(row => row.name === 'lease_token')) await raw('ALTER TABLE story_jobs ADD COLUMN lease_token TEXT');
    await raw(`CREATE INDEX IF NOT EXISTS story_jobs_status ON story_jobs (status, created_at)`);
    await raw('CREATE TABLE IF NOT EXISTS story_cards (scene_id TEXT PRIMARY KEY, job_id TEXT NOT NULL, ordinal INTEGER NOT NULL, revision INTEGER NOT NULL, data TEXT NOT NULL, UNIQUE(job_id, ordinal))');
    await raw('CREATE INDEX IF NOT EXISTS story_cards_job ON story_cards (job_id, ordinal)');
    await raw('CREATE TABLE IF NOT EXISTS story_card_revisions (scene_id TEXT NOT NULL, revision INTEGER NOT NULL, archived_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(scene_id, revision))');
    await raw('CREATE TABLE IF NOT EXISTS variant_requests (id TEXT PRIMARY KEY, idempotency_key TEXT UNIQUE NOT NULL, source_job_id TEXT NOT NULL, platform TEXT NOT NULL, status TEXT NOT NULL, lease_until TEXT, lease_token TEXT, attempts INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, data TEXT NOT NULL)');
    if (database.pool) await raw('ALTER TABLE variant_requests ADD COLUMN IF NOT EXISTS lease_token TEXT');
    else if (!(await raw('PRAGMA table_info(variant_requests)')).rows.some(row => row.name === 'lease_token')) await raw('ALTER TABLE variant_requests ADD COLUMN lease_token TEXT');
    await raw('CREATE INDEX IF NOT EXISTS variant_requests_status ON variant_requests (status,created_at)');
    await raw(`CREATE TABLE IF NOT EXISTS topic_history (fingerprint TEXT PRIMARY KEY, job_id TEXT NOT NULL, created_at TEXT NOT NULL)`);
    await raw(`CREATE TABLE IF NOT EXISTS schedule_occurrences (occurrence_key TEXT PRIMARY KEY, job_id TEXT, created_at TEXT NOT NULL)`);
    await raw("INSERT INTO app_records (key,value) VALUES ('queue_claim_lock','1') ON CONFLICT (key) DO NOTHING");
  })().catch(error => { database.ready = undefined; throw error; });
  return database.ready;
}
export async function query(sql: string, values: unknown[] = []) { await initializeDatabase(); return database.pool ? raw(sql,values) : serialized(() => raw(sql,values)); }
export async function withTransaction<T>(operation: (execute: SqlExecutor) => Promise<T>): Promise<T> {
  await initializeDatabase();
  if (database.pool) {
    const client = await database.pool.connect();
    try {
      await client.query('BEGIN');
      const execute: SqlExecutor = async (sql,values=[]) => { const result=await client.query(postgresSql(sql),values.map(v=>v===undefined?null:v)); return {rows:result.rows,changes:result.rowCount||0}; };
      const result=await operation(execute); await client.query('COMMIT'); return result;
    } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  return serialized(async()=>{
    database.sqlite!.exec('BEGIN IMMEDIATE');
    try { const result=await operation(raw); database.sqlite!.exec('COMMIT'); return result; }
    catch(error) { database.sqlite!.exec('ROLLBACK'); throw error; }
  });
}
export async function getKV<T>(key: string, fallback: T): Promise<T> { const { rows } = await query('SELECT value FROM app_records WHERE key = ?', [key]); return rows[0] ? JSON.parse(String(rows[0].value)) as T : fallback; }
export async function setKV(key: string, value: unknown): Promise<void> { await query('INSERT INTO app_records (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', [key, JSON.stringify(value)]); }
export const rowLockClause = () => process.env.DATABASE_URL ? ' FOR UPDATE' : '';
