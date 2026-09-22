import {
  syncResponseSchema,
  syncRequestMaxBytes,
  type SyncOperation,
  type SyncResponse,
} from '../../../../packages/contracts/src/sync.ts';
import { createClient } from '../../../../packages/client/src/index.ts';
import { headersFor } from '../auth.ts';
import { normalizeUrl } from '../config.ts';
import { discardOperations } from './journal.ts';
import { localFailureSchema, type LocalFailure } from './model.ts';
import { localPrincipalKey, type LocalPrincipalKey } from './identity.ts';
import {
  acknowledgeOperations,
  closeStore,
  openStore,
  readBinding,
  readOperations,
  recordFailure,
  transaction,
  writeSnapshot,
  writeSyncState,
} from './store.ts';
import { closeSyncLock, openSyncLock } from './workspace-store.ts';
import { rebuildProjection } from './projection.ts';

export type SyncOptions = {
  url: string;
  testEmail?: string;
  signal?: AbortSignal;
};

export type SyncReport = {
  accepted: number;
  pending: number;
  failure: LocalFailure | null;
  sequence: number;
};

export async function pullInitialSnapshot(
  options: SyncOptions,
  workspaceRef: string,
): Promise<SyncResponse> {
  const principal = await localPrincipalKey(options.url, options.testEmail);
  const response = await requestSync(options, workspaceRef, []);
  verifyPrincipal(response, principal);
  if (response.failure !== null || response.accepted.length !== 0)
    throw new Error('The server returned an invalid initial sync response.');
  if (response.snapshot === null)
    throw new Error('The server omitted the initial workspace snapshot.');
  return response;
}

export async function synchronize(
  path: string,
  options: SyncOptions,
): Promise<SyncReport> {
  const lock = await openSyncLock(path);
  try {
    return await synchronizeLocked(path, options);
  } finally {
    closeSyncLock(lock);
  }
}

async function synchronizeLocked(
  path: string,
  options: SyncOptions,
): Promise<SyncReport> {
  const principal = await localPrincipalKey(options.url, options.testEmail);
  const before = await openStore(path);
  let workspaceId: string;
  let afterSequence: number;
  let operations: SyncOperation[];
  let persistedFailure: LocalFailure | null;
  try {
    const binding = readBinding(before);
    verifyBinding(binding, options.url, principal);
    workspaceId = binding.workspaceId;
    afterSequence = binding.sequence;
    const pending = readOperations(before);
    persistedFailure = pending.find((entry) => entry.failure)?.failure ?? null;
    operations = persistedFailure
      ? []
      : selectOperations(
          pending.slice(0, 500).map((entry) => entry.operation),
          afterSequence,
        );
  } finally {
    closeStore(before);
  }
  const response = await requestSync(
    options,
    workspaceId,
    operations,
    afterSequence,
  );
  verifyPrincipal(response, principal);
  verifyResponse(response, operations, workspaceId);
  const failure =
    response.failure === null
      ? persistedFailure
      : localFailureSchema.parse(response.failure);
  const after = await openStore(path);
  try {
    transaction(after, () => {
      const binding = readBinding(after);
      verifyBinding(binding, options.url, principal);
      acknowledgeOperations(
        after,
        response.accepted.map((item) => item.operationId),
      );
      recordFailure(after, response.failure);
      if (response.snapshot) writeSnapshot(after, response.snapshot, failure);
      else writeSyncState(after, response.sequence, failure);
      rebuildProjection(after);
    });
    return {
      accepted: response.accepted.length,
      pending: readOperations(after).length,
      failure,
      sequence: response.sequence,
    };
  } finally {
    closeStore(after);
  }
}

function selectOperations(
  candidates: SyncOperation[],
  afterSequence: number,
): SyncOperation[] {
  const baseBytes = Buffer.byteLength(
    JSON.stringify({ operations: [], afterSequence }),
  );
  const selected: SyncOperation[] = [];
  let bytes = baseBytes;
  for (const operation of candidates) {
    const operationBytes = Buffer.byteLength(JSON.stringify(operation));
    const nextBytes = bytes + operationBytes + (selected.length ? 1 : 0);
    if (nextBytes > syncRequestMaxBytes) break;
    selected.push(operation);
    bytes = nextBytes;
  }
  if (selected.length === 0 && candidates.length > 0)
    throw new Error(
      'The first pending operation exceeds the sync request limit.',
    );
  return selected;
}

export async function reconcileAndDiscard(
  path: string,
  options: SyncOptions,
): Promise<{ discarded: number; sequence: number }> {
  const lock = await openSyncLock(path);
  try {
    const principal = await localPrincipalKey(options.url, options.testEmail);
    const before = await openStore(path);
    let workspaceId: string;
    let operationIds: string[];
    try {
      const binding = readBinding(before);
      verifyBinding(binding, options.url, principal);
      workspaceId = binding.workspaceId;
      operationIds = readOperations(before).map(
        (entry) => entry.operation.operationId,
      );
    } finally {
      closeStore(before);
    }
    const response = await requestSync(options, workspaceId, []);
    verifyPrincipal(response, principal);
    verifyResponse(response, [], workspaceId);
    if (response.snapshot === null)
      throw new Error(
        'The server omitted the discard reconciliation snapshot.',
      );
    const snapshot = response.snapshot;
    const store = await openStore(path);
    try {
      const discarded = transaction(store, () => {
        verifyBinding(readBinding(store), options.url, principal);
        writeSnapshot(store, snapshot, null);
        const count = discardOperations(store, operationIds);
        rebuildProjection(store);
        return count;
      });
      return { discarded, sequence: response.sequence };
    } finally {
      closeStore(store);
    }
  } finally {
    closeSyncLock(lock);
  }
}

async function requestSync(
  options: SyncOptions,
  workspaceRef: string,
  operations: SyncOperation[],
  afterSequence?: number,
): Promise<SyncResponse> {
  const url = normalizeUrl(options.url);
  const client = createClient({
    baseUrl: url,
    headers: () => headersFor(url, options.testEmail),
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(30_000)])
      : AbortSignal.timeout(30_000),
  });
  return client.request(
    `/workspaces/${encodeURIComponent(workspaceRef)}/sync`,
    syncResponseSchema,
    {
      method: 'POST',
      body: {
        operations,
        ...(afterSequence === undefined ? {} : { afterSequence }),
      },
    },
  );
}

function verifyResponse(
  response: SyncResponse,
  sent: SyncOperation[],
  workspaceId: string,
): void {
  if (response.workspaceId !== workspaceId)
    throw new Error('Sync response belongs to another workspace.');
  if (response.accepted.length > sent.length)
    throw new Error('Sync response acknowledged unsent operations.');
  verifyAcceptedOperations(response, sent);
  verifyFailurePosition(response, sent);
}

function verifyAcceptedOperations(
  response: SyncResponse,
  sent: SyncOperation[],
): void {
  for (const [index, accepted] of response.accepted.entries()) {
    const operation = sent[index];
    if (!operation || operation.operationId !== accepted.operationId)
      throw new Error('Sync response acknowledged a non-prefix operation.');
    if (
      (operation.kind === 'issue.create' ||
        operation.kind === 'comment.create') &&
      accepted.entityId !== operation.operationId
    )
      throw new Error('Sync response changed a client-generated entity ID.');
  }
}

function verifyFailurePosition(
  response: SyncResponse,
  sent: SyncOperation[],
): void {
  const next = sent[response.accepted.length];
  if (response.failure && response.failure.operationId !== next?.operationId)
    throw new Error('Sync response rejected a non-prefix operation.');
  if (!response.failure && response.accepted.length !== sent.length)
    throw new Error('Sync response omitted an operation result.');
}

function verifyPrincipal(
  response: SyncResponse,
  expected: LocalPrincipalKey,
): void {
  const actual = response.principal;
  if (actual.issuer !== expected.issuer || actual.subject !== expected.subject)
    throw new Error('Sync response belongs to another signed-in account.');
}

function verifyBinding(
  binding: ReturnType<typeof readBinding>,
  url: string,
  principal: LocalPrincipalKey,
): void {
  if (
    binding.url !== normalizeUrl(url) ||
    binding.issuer !== principal.issuer ||
    binding.subject !== principal.subject
  )
    throw new Error('Local database belongs to another account or server.');
}
