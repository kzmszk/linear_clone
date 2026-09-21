import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, relative, sep } from 'node:path';
import { hashBytes, type FileSummary } from './model.ts';

export async function ensurePrivateDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  await chmod(path, 0o700);
}

export async function writePrivateJson(
  path: string,
  value: unknown,
): Promise<void> {
  await ensurePrivateDir(dirname(path));
  await writeFile(path, `${JSON.stringify(value)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
}

export async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

export function safeRecordFile(kind: string, sourceId: string): string {
  const encoded = encodeURIComponent(sourceId).replace(/%/gu, '_');
  return join('records', kind, `${encoded}.json`);
}

export function safeFileName(sourceId: string, sourceUrl: string): string {
  const suffix =
    sourceUrl
      .split('?')[0]
      .split('/')
      .pop()
      ?.replace(/[^A-Za-z0-9._-]/gu, '_') ?? 'file';
  return join(
    'files',
    `${sourceId.replace(/[^A-Za-z0-9_-]/gu, '_')}-${suffix}`,
  );
}

function allowedHost(url: URL): boolean {
  return url.hostname === 'linear.app' || url.hostname.endsWith('.linear.app');
}

export function isExternalLink(sourceUrl: string): boolean {
  try {
    const url = new URL(sourceUrl);
    return url.protocol !== 'https:' || !allowedHost(url);
  } catch {
    return false;
  }
}

export async function downloadLinearFile(
  outputDir: string,
  sourceId: string,
  sourceUrl: string,
): Promise<FileSummary> {
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    return { sourceId, sourceUrl, state: 'missing', reason: 'invalid URL' };
  }
  if (url.protocol !== 'https:' || !allowedHost(url))
    return {
      sourceId,
      sourceUrl,
      state: 'missing',
      reason: 'host is outside the Linear allowlist',
    };
  const headers: Record<string, string> = {};
  const key = process.env.LINEAR_API_KEY;
  if (key) headers.Authorization = `Bearer ${key}`;
  try {
    const response = await fetch(url, { redirect: 'manual', headers });
    if (!response.ok)
      return {
        sourceId,
        sourceUrl,
        state: 'missing',
        reason: `HTTP ${response.status}`,
      };
    const data = new Uint8Array(await response.arrayBuffer());
    const localFile = safeFileName(sourceId, sourceUrl);
    const path = join(outputDir, localFile);
    await ensurePrivateDir(dirname(path));
    await writeFile(path, data, { mode: 0o600 });
    await chmod(path, 0o600);
    return {
      sourceId,
      sourceUrl,
      localFile,
      checksum: hashBytes(data),
      size: data.byteLength,
      contentType: response.headers.get('content-type') ?? undefined,
      state: 'ready',
    };
  } catch (error) {
    return {
      sourceId,
      sourceUrl,
      state: 'missing',
      reason: error instanceof Error ? error.message : 'download failed',
    };
  }
}

export function isPrivateRelativePath(
  outputDir: string,
  path: string,
): boolean {
  const resolved = normalize(path);
  const root = normalize(outputDir);
  const rel = relative(root, resolved);
  return (
    rel !== '..' &&
    !rel.startsWith(`..${sep}`) &&
    !rel.includes(`${sep}.git${sep}`)
  );
}
