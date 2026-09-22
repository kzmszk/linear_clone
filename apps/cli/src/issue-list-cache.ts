import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import * as z from 'zod';
import { issueListSchema } from './types.ts';
import type { ApiContext } from './api.ts';

const cacheEntrySchema = z.object({
  format: z.literal(1),
  etag: z.string().min(1),
  page: issueListSchema.extend({ cursor: z.null() }),
});
type CacheEntry = z.infer<typeof cacheEntrySchema>;

export async function cachedIssuePage(
  api: ApiContext,
  requestPath: string,
): Promise<z.infer<typeof issueListSchema>> {
  const key = createHash('sha256')
    .update(JSON.stringify([api.url, await api.cacheScope(), requestPath]))
    .digest('hex');
  const base = process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache');
  const path = join(base, 'linc', 'issue-lists', `${key}.json`);
  const cached = await readEntry(path);
  const result = await api.client.conditionalRequest(
    requestPath,
    issueListSchema,
    cached?.etag,
  );
  if (result.kind === 'not-modified') {
    if (cached) return cached.page;
    throw new Error('Server returned 304 without a cached issue list.');
  }
  if (result.etag && result.value.cursor === null)
    await writeEntry(path, {
      format: 1,
      etag: result.etag,
      page: { ...result.value, cursor: null },
    });
  else await rm(path, { force: true }).catch(() => {});
  return result.value;
}

async function readEntry(path: string): Promise<CacheEntry | undefined> {
  try {
    const input: unknown = JSON.parse(await readFile(path, 'utf8'));
    const result = cacheEntrySchema.safeParse(input);
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

async function writeEntry(path: string, value: CacheEntry): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
    await rename(temporary, path);
  } catch {
    await rm(temporary, { force: true }).catch(() => {});
  }
}
