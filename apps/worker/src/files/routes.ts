import { HttpError } from '../errors.ts';
import type { WorkerEnv } from '../types.ts';

const maximumBytes = 10 * 1024 * 1024;
const inlineTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
]);
type FileRoute = {
  workspaceId: string;
  issueId: string;
  checksum: string | undefined;
};

function matchFileRoute(path: string): FileRoute | null {
  const match =
    /^\/api\/v1\/workspaces\/([^/]+)\/issues\/([^/]+)\/files(?:\/([a-f0-9]{64}))?$/.exec(
      path,
    );
  if (!match) return null;
  return { workspaceId: match[1], issueId: match[2], checksum: match[3] };
}

export async function handleIssueFile(
  request: Request,
  env: WorkerEnv,
  tracker: DurableObjectStub,
): Promise<Response | null> {
  const route = matchFileRoute(new URL(request.url).pathname);
  if (!route) return null;
  const issueUrl = new URL(
    `/api/v1/workspaces/${route.workspaceId}/issues/${route.issueId}`,
    request.url,
  );
  const headers = new Headers(request.headers);
  headers.delete('content-length');
  const permission = await tracker.fetch(new Request(issueUrl, { headers }));
  if (!permission.ok) return permission;
  const keyPrefix = `issues/${route.workspaceId}/${route.issueId}`;
  if (request.method === 'POST' && !route.checksum)
    return uploadFile(request, env.FILES, keyPrefix);
  if (request.method === 'GET' && route.checksum)
    return downloadFile(env.FILES, `${keyPrefix}/${route.checksum}`);
  throw new HttpError(
    405,
    'method_not_allowed',
    'Use POST to upload or GET to download a file',
  );
}

async function uploadFile(
  request: Request,
  bucket: R2Bucket,
  prefix: string,
): Promise<Response> {
  if (Number(request.headers.get('content-length')) > maximumBytes) {
    throw new HttpError(
      413,
      'file_too_large',
      'Files must be 10 MB or smaller',
    );
  }
  const content = await request.arrayBuffer();
  if (content.byteLength > maximumBytes)
    throw new HttpError(
      413,
      'file_too_large',
      'Files must be 10 MB or smaller',
    );
  const digest = await crypto.subtle.digest('SHA-256', content);
  const checksum = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  const contentType =
    request.headers.get('content-type')?.split(';')[0] ??
    'application/octet-stream';
  await bucket.put(`${prefix}/${checksum}`, content, {
    httpMetadata: { contentType },
  });
  const url = `${new URL(request.url).pathname}/${checksum}`;
  return Response.json(
    { url, checksum, size: content.byteLength, contentType },
    { status: 201 },
  );
}

async function downloadFile(bucket: R2Bucket, key: string): Promise<Response> {
  const object = await bucket.get(key);
  if (!object) throw new HttpError(404, 'not_found', 'File not found');
  const contentType =
    object.httpMetadata?.contentType ?? 'application/octet-stream';
  return new Response(object.body, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(object.size),
      'Content-Disposition': inlineTypes.has(contentType)
        ? 'inline'
        : 'attachment',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'",
    },
  });
}
