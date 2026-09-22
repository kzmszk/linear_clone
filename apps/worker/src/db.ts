import type { SqlDb } from './types.ts';

export function rows<T extends Record<string, SqlStorageValue>>(
  sql: SqlDb,
  query: string,
  ...bindings: SqlStorageValue[]
): T[] {
  return sql.exec<T>(query, ...bindings).toArray();
}

export function one<T extends Record<string, SqlStorageValue>>(
  sql: SqlDb,
  query: string,
  ...bindings: SqlStorageValue[]
): T | null {
  return rows<T>(sql, query, ...bindings)[0] ?? null;
}

export function now(): string {
  return new Date().toISOString();
}

export function newId(): string {
  return crypto.randomUUID();
}

export function parseBoolean(value: string | null, fallback: boolean): boolean {
  if (value === null) return fallback;
  return value === 'true' || value === '1';
}
