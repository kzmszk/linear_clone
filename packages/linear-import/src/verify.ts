import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hashBytes, hashJson, type ImportTransport } from './model.ts';
import { destinationVerifySchema } from './destination-schema.ts';
import { verifyDestination } from './destination-verify.ts';
import { buildImportPlan, readExport, type LoadedExport } from './plan.ts';

export type LocalVerifyReport = {
  ok: boolean;
  records: number;
  files: number;
  mismatches: string[];
  missing: string[];
  unsupported?: string[];
  destination?: unknown;
};

export async function verifyExport(
  outputDir: string,
): Promise<LocalVerifyReport> {
  const loaded = await readExport(outputDir);
  return verifyLoaded(loaded);
}

export async function verifyImport(
  outputDir: string,
  workspaceId: string,
  transport: ImportTransport,
): Promise<LocalVerifyReport> {
  const loaded = await readExport(outputDir);
  const local = await verifyLoaded(loaded);
  const plan = await buildImportPlan(outputDir);
  const destination = await transport.request(
    `/workspaces/${encodeURIComponent(workspaceId)}/imports/verify`,
    destinationVerifySchema,
    {
      method: 'POST',
      body: {
        runId: loaded.manifest.runId,
        provider: 'linear',
        sourceWorkspaceId: loaded.manifest.sourceWorkspaceId,
      },
      operationId: crypto.randomUUID(),
    },
  );
  const checks = await verifyDestination(
    loaded,
    workspaceId,
    destination,
    transport,
  );
  const mismatches = [...local.mismatches, ...checks.mismatches];
  const missing = [...local.missing];
  const unsupported = [...(local.unsupported ?? []), ...checks.unsupported];
  return {
    ok: local.ok && mismatches.length === 0 && unsupported.length === 0,
    records: local.records,
    files: local.files,
    mismatches,
    missing,
    unsupported,
    destination: {
      ...destination,
      checks: checks.summary,
      expectedKinds: plan.counts,
    },
  };
}

async function verifyLoaded(loaded: LoadedExport): Promise<LocalVerifyReport> {
  const mismatches: string[] = [];
  const missing = [...loaded.manifest.missing];
  for (const record of loaded.records) {
    const json = hashJson(record.payload);
    if (json.hash !== record.summary.payloadHash)
      mismatches.push(
        `record ${record.summary.kind}:${record.summary.sourceId} hash mismatch`,
      );
  }
  let readyFiles = 0;
  for (const file of loaded.manifest.files) {
    if (file.state !== 'ready' || !file.localFile || !file.checksum) continue;
    try {
      const bytes = await readFile(join(loaded.outputDir, file.localFile));
      if (hashBytes(bytes) !== file.checksum)
        mismatches.push(`file ${file.sourceId} checksum mismatch`);
      else readyFiles += 1;
    } catch {
      missing.push(`file ${file.sourceId}: local file missing`);
    }
  }
  return {
    ok: mismatches.length === 0 && missing.length === 0,
    records: loaded.records.length,
    files: readyFiles,
    mismatches,
    missing: [...new Set(missing)].sort(),
  };
}
