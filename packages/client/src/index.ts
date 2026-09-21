import { z } from 'zod';
import { errorSchema, fileUploadSchema } from '../../contracts/src/index.ts';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public current: unknown = undefined,
  ) {
    super(message);
  }
}
export type ClientOptions = {
  baseUrl?: string;
  headers?: () => Promise<Record<string, string>>;
};

async function parseResponse<T>(
  response: Response,
  schema: z.ZodType<T>,
): Promise<T> {
  const body: unknown = await response.json();
  if (!response.ok) {
    const parsed = errorSchema.safeParse(body);
    if (parsed.success)
      throw new ApiError(
        response.status,
        parsed.data.error.code,
        parsed.data.error.message,
        parsed.data.error.current,
      );
    throw new ApiError(
      response.status,
      'request_failed',
      `Request failed (${response.status})`,
    );
  }
  return schema.parse(body);
}

export function createClient(options: ClientOptions = {}) {
  async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    init: { method?: string; body?: unknown; operationId?: string } = {},
  ): Promise<T> {
    const headers = new Headers(await options.headers?.());
    headers.set('Content-Type', 'application/json');
    if (init.method && init.method !== 'GET')
      headers.set('Idempotency-Key', init.operationId ?? crypto.randomUUID());
    const response = await fetch(`${options.baseUrl ?? ''}/api/v1${path}`, {
      method: init.method ?? 'GET',
      headers,
      credentials: 'same-origin',
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
    return parseResponse(response, schema);
  }
  async function uploadFile(
    workspaceId: string,
    issueId: string,
    content: Blob,
  ) {
    const headers = new Headers(await options.headers?.());
    headers.set('Content-Type', content.type || 'application/octet-stream');
    const response = await fetch(
      `${options.baseUrl ?? ''}/api/v1/workspaces/${workspaceId}/issues/${issueId}/files`,
      {
        method: 'POST',
        headers,
        credentials: 'same-origin',
        body: content,
      },
    );
    return parseResponse(response, fileUploadSchema);
  }
  return { request, uploadFile };
}
export type ApiClient = ReturnType<typeof createClient>;
