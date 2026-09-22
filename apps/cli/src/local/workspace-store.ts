import { chmod } from 'node:fs/promises';
import { normalizeUrl } from '../config.ts';
import { localDatabaseFiles, type LocalPrincipalKey } from './identity.ts';
import {
  closeStore,
  openReadOnlyStore,
  readBinding,
  type LocalStore,
} from './store.ts';

type DatabaseSync = import('node:sqlite').DatabaseSync;

export async function findStorePath(
  url: string,
  principal: LocalPrincipalKey,
  workspaceRef?: string,
): Promise<string> {
  const matches: string[] = [];
  for (const path of await localDatabaseFiles()) {
    const store = await openReadOnlyStore(path);
    try {
      if (bindingMatches(store, url, principal, workspaceRef))
        matches.push(path);
    } finally {
      closeStore(store);
    }
  }
  if (matches.length === 1) return matches[0];
  if (matches.length === 0)
    throw new Error('Local workspace is not initialized. Run linc local init.');
  throw new Error('Select a local workspace with --workspace <slug-or-id>.');
}

function bindingMatches(
  store: LocalStore,
  url: string,
  principal: LocalPrincipalKey,
  workspaceRef?: string,
): boolean {
  const binding = readBinding(store);
  if (
    binding.url !== normalizeUrl(url) ||
    binding.issuer !== principal.issuer ||
    binding.subject !== principal.subject
  )
    return false;
  return (
    workspaceRef === undefined ||
    binding.workspaceId === workspaceRef ||
    binding.workspaceSlug.toLowerCase() === workspaceRef.toLowerCase()
  );
}

export async function openSyncLock(path: string): Promise<DatabaseSync> {
  const { DatabaseSync } = await import('node:sqlite');
  const lockPath = `${path}.sync-lock.sqlite`;
  const lock = new DatabaseSync(lockPath);
  try {
    lock.exec('PRAGMA busy_timeout = 5000; BEGIN IMMEDIATE;');
    await chmod(lockPath, 0o600);
    return lock;
  } catch (error) {
    lock.close();
    throw error;
  }
}

export function closeSyncLock(lock: DatabaseSync): void {
  try {
    lock.exec('COMMIT');
  } finally {
    lock.close();
  }
}
