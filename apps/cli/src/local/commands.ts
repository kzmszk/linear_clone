import type { Command } from 'commander';
import * as z from 'zod';
import { normalizeUrl } from '../config.ts';
import { optionsFor, printError, printValue } from '../output.ts';
import { localPathFor, syncOptionsFor, withLocalStore } from './context.ts';
import { databasePath, localPrincipalKey } from './identity.ts';
import { readDiscardedOperations } from './journal.ts';
import { projectSnapshot } from './projection.ts';
import {
  closeStore,
  initializeStore,
  openStore,
  readBinding,
  readOperations,
} from './store.ts';
import {
  pullInitialSnapshot,
  reconcileAndDiscard,
  synchronize,
  type SyncReport,
} from './sync.ts';
import { findStorePath } from './workspace-store.ts';

export async function initializeLocal(command: Command): Promise<void> {
  const options = optionsFor(command);
  if (!options.workspace)
    throw new Error('Local init requires --workspace <slug-or-id>.');
  const principal = await localPrincipalKey(options.url, options.testEmail);
  const existing = await existingStorePath(
    options.url,
    principal,
    options.workspace,
  );
  if (existing) {
    printSyncReport(
      await synchronize(existing, syncOptionsFor(options)),
      options.json,
    );
    return;
  }
  const response = await pullInitialSnapshot(
    syncOptionsFor(options),
    options.workspace,
  );
  const snapshot = response.snapshot;
  if (snapshot === null)
    throw new Error('The server omitted the initial workspace snapshot.');
  const path = await databasePath(
    options.url,
    principal,
    snapshot.workspace.id,
  );
  const store = await openStore(path);
  try {
    initializeStore(
      store,
      {
        url: normalizeUrl(options.url),
        workspaceId: snapshot.workspace.id,
        workspaceSlug: snapshot.workspace.slug,
        issuer: snapshot.principal.issuer,
        subject: snapshot.principal.subject,
        email: snapshot.principal.email,
        sequence: snapshot.sequence,
        lastSyncAt: new Date().toISOString(),
        lastError: null,
      },
      snapshot,
      projectSnapshot(snapshot, []),
    );
  } finally {
    closeStore(store);
  }
  printValue(
    { workspace: snapshot.workspace, sequence: snapshot.sequence, pending: 0 },
    options.json,
  );
}

export async function syncLocal(command: Command): Promise<void> {
  const { path, options } = await localPathFor(command);
  printSyncReport(
    await synchronize(path, syncOptionsFor(options)),
    options.json,
  );
}

export async function showLocalStatus(command: Command): Promise<void> {
  await withLocalStore(command, (store, json) => {
    const binding = readBinding(store);
    const operations = readOperations(store);
    let blocked = false;
    const pendingOperations = operations.map((entry) => {
      const state = entry.failure
        ? 'conflict'
        : blocked
          ? 'blocked'
          : 'pending';
      if (entry.failure) blocked = true;
      return { ...entry, state };
    });
    printValue(
      {
        binding,
        pending: operations.length,
        failure: binding.lastError,
        operations: pendingOperations,
        discarded: readDiscardedOperations(store),
      },
      json,
    );
  });
}

export async function discardLocal(command: Command): Promise<void> {
  const { path, options } = await localPathFor(command);
  printValue(
    await reconcileAndDiscard(path, syncOptionsFor(options)),
    options.json,
  );
}

export async function watchLocal(command: Command): Promise<void> {
  const interval = z
    .object({ interval: z.coerce.number().positive().max(3600) })
    .parse(command.opts()).interval;
  const { path, options } = await localPathFor(command);
  let stopped = false;
  let wake: (() => void) | undefined;
  const controller = new AbortController();
  const stop = () => {
    stopped = true;
    controller.abort();
    wake?.();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    while (!stopped) {
      try {
        printValue(
          await synchronize(path, {
            ...syncOptionsFor(options),
            signal: controller.signal,
          }),
          options.json,
        );
      } catch (error) {
        if (!stopped) printError(error, options.json);
      }
      if (!stopped)
        await waitForNextSync(interval, (resolve) => (wake = resolve));
    }
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
}

function waitForNextSync(
  seconds: number,
  setWake: (resolve: () => void) => void,
): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, seconds * 1000);
    setWake(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function existingStorePath(
  url: string,
  principal: Awaited<ReturnType<typeof localPrincipalKey>>,
  workspace: string,
): Promise<string | undefined> {
  try {
    return await findStorePath(url, principal, workspace);
  } catch (error) {
    if (error instanceof Error && error.message.includes('not initialized'))
      return undefined;
    throw error;
  }
}

function printSyncReport(report: SyncReport, json: boolean): void {
  printValue(report, json);
  if (report.failure) process.exitCode = report.failure.status === 409 ? 2 : 1;
}
