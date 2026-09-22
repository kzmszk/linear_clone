import {
  metadataSchema,
  type Metadata,
} from '../../../packages/contracts/src/index.ts';
import {
  createClient,
  type ApiClient,
} from '../../../packages/client/src/index.ts';
import { headersFor } from './auth.ts';
import { normalizeUrl } from './config.ts';
import { mutationSchema } from './types.ts';
import * as z from 'zod';
import { createHash } from 'node:crypto';

type DownloadedFile = {
  bytes: Uint8Array;
  contentType: string | null;
};
export type ApiContext = {
  client: ApiClient;
  url: string;
  cacheScope: () => Promise<string>;
  metadata: (workspaceId: string) => Promise<Metadata>;
  downloadFile: (path: string) => Promise<DownloadedFile>;
};

export function createApiContext(url: string, testEmail?: string): ApiContext {
  const normalizedUrl = normalizeUrl(url);
  let authentication: Promise<Record<string, string>> | undefined;
  const headers = () =>
    (authentication ??= headersFor(normalizedUrl, testEmail));
  const client = createClient({
    baseUrl: normalizedUrl,
    headers,
  });
  let cacheScope: Promise<string> | undefined;
  const metadata = new Map<string, Promise<Metadata>>();
  return {
    url: normalizedUrl,
    client,
    cacheScope: () =>
      (cacheScope ??= headers().then((value) =>
        createHash('sha256').update(JSON.stringify(value)).digest('hex'),
      )),
    metadata: (workspaceId) => {
      let pending = metadata.get(workspaceId);
      if (!pending) {
        pending = client.request(
          `/workspaces/${encodeURIComponent(workspaceId)}/metadata`,
          metadataSchema,
        );
        metadata.set(workspaceId, pending);
      }
      return pending;
    },
    downloadFile: async (path) => {
      const target = new URL(path, `${normalizedUrl}/`);
      const base = new URL(normalizedUrl);
      if (
        target.origin !== base.origin ||
        !target.pathname.startsWith('/api/v1/')
      )
        throw new Error('Destination file URL is outside the configured API.');
      const headers = new Headers(await headersFor(normalizedUrl, testEmail));
      const response = await fetch(target, {
        method: 'GET',
        headers,
        redirect: 'manual',
      });
      if (!response.ok)
        throw new Error(
          `Destination file download failed (${response.status}).`,
        );
      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        contentType: response.headers.get('content-type'),
      };
    },
  };
}

export function queryPath(
  path: string,
  params: Record<string, string | undefined>,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value !== undefined) query.set(key, value);
  const encoded = query.toString();
  return encoded ? `${path}?${encoded}` : path;
}

export async function listRecords<T>(
  api: ApiContext,
  path: string,
  schema: z.ZodType<T>,
): Promise<T[]> {
  return api.client.request(path, z.array(schema));
}

export async function requestRecord<T>(
  api: ApiContext,
  path: string,
  schema: z.ZodType<T>,
  init: { method?: string; body?: unknown; operationId?: string } = {},
): Promise<T | { current: T }> {
  if (!init.method) return api.client.request(path, schema, init);
  return api.client.request(path, mutationSchema(schema), init);
}
