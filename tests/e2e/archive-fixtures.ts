import { expect, type APIRequestContext } from '@playwright/test';

export type WorkspaceRecord = {
  id: string;
  name: string;
  slug: string;
  version: number;
};
export type ResourceRecord = { id: string; version: number; name: string };
export type IssueRecord = { id: string; identifier: string; title: string };

export async function createWorkspace(
  request: APIRequestContext,
  prefix: string,
): Promise<WorkspaceRecord> {
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 10);
  const me = await (await request.get('/api/v1/me')).json();
  const response = await request.post(
    me.workspaces.length ? '/api/v1/workspaces' : '/api/v1/bootstrap',
    {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      data: { name: `${prefix} ${suffix}`, slug: `${prefix}-${suffix}` },
    },
  );
  expect(response.ok()).toBeTruthy();
  return (await response.json()).current as WorkspaceRecord;
}

export async function createResource<T>(
  request: APIRequestContext,
  path: string,
  data: Record<string, unknown>,
): Promise<T> {
  const response = await request.post(path, {
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    data,
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).current as T;
}

export function uniqueTeamKey() {
  return `A${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
}
