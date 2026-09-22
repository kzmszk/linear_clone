import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function normalizeUrl(value) {
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/+$/u, '');
  return url.toString().replace(/\/$/u, '');
}

function configPath() {
  return (
    process.env.LINC_CONFIG ??
    path.join(
      process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'),
      'linc',
      'config.json',
    )
  );
}

export function isLocalUrl(value) {
  return ['localhost', '127.0.0.1', '::1'].includes(new URL(value).hostname);
}

export async function authenticatedRequest(url) {
  const normalized = normalizeUrl(url);
  const config = JSON.parse(await readFile(configPath(), 'utf8'));
  const token = config.profiles?.[normalized]?.accessToken;
  assert.ok(token, `No saved Access login for ${normalized}`);
  return async (route, { method = 'GET', body } = {}) => {
    const response = await fetch(`${normalized}/api/v1${route}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Cf-Access-Token': token,
        'Content-Type': 'application/json',
        'Idempotency-Key': randomUUID(),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  };
}

export function expectSuccess(result, operation) {
  assert.ok(
    result.status >= 200 && result.status < 300,
    `${operation} failed with HTTP ${result.status}`,
  );
  return result.body;
}

export function mutationCurrent(result, operation) {
  const body = expectSuccess(result, operation);
  assert.ok(body.current, `${operation} did not return current`);
  return body.current;
}

export async function createWorkspaceFixture(
  request,
  suffix,
  variant,
  onWorkspaceCreated = async () => {},
) {
  const workspace = mutationCurrent(
    await request('/workspaces', {
      method: 'POST',
      body: {
        name: `CLI daily ${suffix} ${variant}`,
        slug: `cli-daily-${suffix}-${variant}`,
      },
    }),
    `create ${variant} workspace`,
  );
  await onWorkspaceCreated(workspace);
  const team = mutationCurrent(
    await request(`/workspaces/${workspace.id}/teams`, {
      method: 'POST',
      body: { key: 'BENCH', name: 'Benchmark team' },
    }),
    `create ${variant} team`,
  );
  const project = mutationCurrent(
    await request(`/workspaces/${workspace.id}/projects`, {
      method: 'POST',
      body: {
        name: 'Daily benchmark project',
        status: 'planned',
        teamIds: [team.id],
      },
    }),
    `create ${variant} project`,
  );
  const metadata = expectSuccess(
    await request(`/workspaces/${workspace.id}/metadata`),
    `read ${variant} metadata`,
  );
  const states = {
    open: metadata.states.find(
      (state) => state.teamId === team.id && state.type === 'backlog',
    ),
    started: metadata.states.find(
      (state) => state.teamId === team.id && state.type === 'started',
    ),
    closed: metadata.states.find(
      (state) => state.teamId === team.id && state.type === 'completed',
    ),
  };
  assert.ok(
    states.open && states.started && states.closed,
    'benchmark team has no default states',
  );
  return {
    workspace,
    team,
    project,
    states,
    issueIds: { open: [], closed: [] },
  };
}

export async function createIssue(request, fixture, title, stateId) {
  return mutationCurrent(
    await request(`/workspaces/${fixture.workspace.id}/issues`, {
      method: 'POST',
      body: {
        teamId: fixture.team.id,
        title,
        stateId,
        projectId: fixture.project.id,
      },
    }),
    `create issue ${title}`,
  );
}

export async function seedIssues(request, fixture, counts) {
  for (const [kind, stateId] of [
    ['open', fixture.states.open.id],
    ['closed', fixture.states.closed.id],
  ]) {
    for (let index = 1; index <= counts[kind]; index += 1) {
      const issue = await createIssue(
        request,
        fixture,
        `Daily ${kind} ${String(index).padStart(3, '0')}`,
        stateId,
      );
      fixture.issueIds[kind].push(issue.id);
    }
  }
}

export function cliBase(url, fixture, local, workspaceForm = 'id') {
  const workspace =
    workspaceForm === 'slug' ? fixture.workspace.slug : fixture.workspace.id;
  return [
    '--url',
    url,
    ...(local ? ['--test-email', 'owner@example.test'] : []),
    '--workspace',
    workspace,
    '--json',
  ];
}

export function parseJson(stdout, operation) {
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(`${operation} did not produce JSON output`);
  }
}

export async function verifyIssue(request, fixture, issueId, expected) {
  const saved = expectSuccess(
    await request(`/workspaces/${fixture.workspace.id}/issues/${issueId}`),
    `verify issue ${issueId}`,
  );
  for (const [field, value] of Object.entries(expected))
    assert.equal(saved[field], value, `${field} was not saved`);
  return { id: saved.id, identifier: saved.identifier, version: saved.version };
}

export async function archiveWorkspace(request, workspace) {
  const archived = mutationCurrent(
    await request(`/workspaces/${workspace.id}`, {
      method: 'PATCH',
      body: {
        expectedVersion: workspace.version,
        archivedAt: new Date().toISOString(),
      },
    }),
    `archive ${workspace.id}`,
  );
  assert.ok(archived.archivedAt, `workspace ${workspace.id} was not archived`);
  return { id: workspace.id, archivedAt: archived.archivedAt };
}
