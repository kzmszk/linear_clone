import assert from 'node:assert/strict';
import {
  cliBase,
  createIssue,
  expectSuccess,
  parseJson,
  verifyIssue,
} from './benchmark-cli-daily-fixture.mjs';

function pairedArgs(fixtures, build) {
  return Object.fromEntries(
    Object.entries(fixtures).map(([variant, fixture]) => [
      variant,
      build(variant, fixture),
    ]),
  );
}

function listWorkload({ url, fixtures, local, workspaceForm, phase, counts }) {
  return {
    name: 'issue-list-open-default',
    command: 'linc issue list',
    async prepareTrial() {
      return {
        args: pairedArgs(fixtures, (_, fixture) => [
          ...cliBase(url, fixture, local, workspaceForm),
          'issue',
          'list',
        ]),
        traceArgs: pairedArgs(fixtures, (_, fixture) => [
          ...cliBase(url, fixture, local, workspaceForm),
          'issue',
          'list',
        ]),
        async verify(results) {
          const expectedBefore = counts.open + counts.closed;
          const expectedAfter =
            phase === 'baseline' ? expectedBefore : counts.open;
          const verification = {};
          for (const variant of ['before', 'after']) {
            const items = parseJson(results[variant].stdout, `${variant} list`);
            const expectedCount =
              variant === 'after' ? expectedAfter : expectedBefore;
            assert.equal(
              items.length,
              expectedCount,
              `${variant} default list count`,
            );
            const expectedIds = new Set(
              variant === 'after' && phase === 'final'
                ? fixtures[variant].issueIds.open
                : fixtures[variant].issueIds.open.concat(
                    fixtures[variant].issueIds.closed,
                  ),
            );
            assert.deepEqual(
              new Set(items.map(({ id }) => id)),
              expectedIds,
              `${variant} default list contents`,
            );
            verification[variant] = {
              count: items.length,
              open: counts.open,
              closed: items.length - counts.open,
            };
          }
          return verification;
        },
      };
    },
  };
}

function filteredListWorkload({ url, fixtures, local, workspaceForm, counts }) {
  return {
    name: 'issue-list-open-filtered',
    command: 'linc issue list --state Backlog',
    async prepareTrial() {
      return {
        args: pairedArgs(fixtures, (_, fixture) => [
          ...cliBase(url, fixture, local, workspaceForm),
          'issue',
          'list',
          '--state',
          'Backlog',
        ]),
        traceArgs: pairedArgs(fixtures, (_, fixture) => [
          ...cliBase(url, fixture, local, workspaceForm),
          'issue',
          'list',
          '--state',
          'Backlog',
        ]),
        async verify(results) {
          const verification = {};
          for (const variant of ['before', 'after']) {
            const items = parseJson(
              results[variant].stdout,
              `${variant} filtered list`,
            );
            assert.equal(
              items.length,
              counts.open,
              `${variant} filtered list count`,
            );
            assert.deepEqual(
              new Set(items.map(({ id }) => id)),
              new Set(fixtures[variant].issueIds.open),
            );
            verification[variant] = { count: items.length, closed: 0 };
          }
          return verification;
        },
      };
    },
  };
}

function createWorkload({ url, fixtures, local, workspaceForm, request }) {
  return {
    name: 'issue-create',
    command:
      'linc issue create --team BENCH --project "Daily benchmark project"',
    async prepareTrial(trial) {
      const title = `Daily create ${trial + 1}`;
      return {
        args: pairedArgs(fixtures, (_, fixture) => [
          ...cliBase(url, fixture, local, workspaceForm),
          'issue',
          'create',
          '--team',
          fixture.team.key,
          '--project',
          fixture.project.name,
          '--title',
          title,
        ]),
        traceArgs: pairedArgs(fixtures, (_, fixture) => [
          ...cliBase(url, fixture, local, workspaceForm),
          'issue',
          'create',
          '--team',
          fixture.team.key,
          '--project',
          fixture.project.name,
          '--title',
          `Daily trace create ${trial + 1}`,
        ]),
        async verify(results) {
          const outputs = Object.fromEntries(
            Object.entries(results).map(([variant, result]) => [
              variant,
              parseJson(result.stdout, `${variant} create`),
            ]),
          );
          assert.equal(
            outputs.before.current.identifier,
            outputs.after.current.identifier,
          );
          const verification = {};
          for (const variant of ['before', 'after']) {
            const issue = outputs[variant].current;
            assert.equal(issue.title, title);
            assert.equal(issue.projectId, fixtures[variant].project.id);
            verification[variant] = await verifyIssue(
              request,
              fixtures[variant],
              issue.id,
              { title, version: 1 },
            );
          }
          return verification;
        },
      };
    },
  };
}

function updateWorkload({ url, fixtures, local, workspaceForm, request }) {
  return {
    name: 'issue-state-update',
    command: 'linc issue update <identifier> --state "In Progress"',
    async prepareTrial(trial) {
      const issues = {};
      const traceIssues = {};
      for (const [variant, fixture] of Object.entries(fixtures))
        issues[variant] = await createIssue(
          request,
          fixture,
          `Daily state update ${trial + 1}`,
          fixture.states.open.id,
        );
      for (const [variant, fixture] of Object.entries(fixtures))
        traceIssues[variant] = await createIssue(
          request,
          fixture,
          `Daily trace state update ${trial + 1}`,
          fixture.states.open.id,
        );
      return {
        args: pairedArgs(fixtures, (variant, fixture) => [
          ...cliBase(url, fixture, local, workspaceForm),
          'issue',
          'update',
          issues[variant].identifier,
          '--state',
          'In Progress',
        ]),
        traceArgs: pairedArgs(fixtures, (variant, fixture) => [
          ...cliBase(url, fixture, local, workspaceForm),
          'issue',
          'update',
          traceIssues[variant].identifier,
          '--state',
          'In Progress',
        ]),
        async verify(results) {
          const verification = {};
          for (const variant of ['before', 'after']) {
            const issue = parseJson(
              results[variant].stdout,
              `${variant} update`,
            ).current;
            assert.equal(issue.identifier, issues[variant].identifier);
            assert.equal(issue.stateId, fixtures[variant].states.started.id);
            assert.equal(issue.version, 2);
            verification[variant] = {
              expectedVersion: issues[variant].version,
              ...(await verifyIssue(request, fixtures[variant], issue.id, {
                stateId: fixtures[variant].states.started.id,
                version: 2,
              })),
            };
          }
          return verification;
        },
      };
    },
  };
}

function commentWorkload({ url, fixtures, local, workspaceForm, request }) {
  return {
    name: 'comment-create',
    command: 'linc issue comment create <identifier> --body <text>',
    async prepareTrial(trial) {
      const issues = {};
      const traceIssues = {};
      for (const [variant, fixture] of Object.entries(fixtures))
        issues[variant] = await createIssue(
          request,
          fixture,
          `Daily comment ${trial + 1}`,
          fixture.states.open.id,
        );
      for (const [variant, fixture] of Object.entries(fixtures))
        traceIssues[variant] = await createIssue(
          request,
          fixture,
          `Daily trace comment ${trial + 1}`,
          fixture.states.open.id,
        );
      const body = `Daily benchmark comment ${trial + 1}`;
      return {
        args: pairedArgs(fixtures, (variant, fixture) => [
          ...cliBase(url, fixture, local, workspaceForm),
          'issue',
          'comment',
          'create',
          issues[variant].identifier,
          '--body',
          body,
        ]),
        traceArgs: pairedArgs(fixtures, (variant, fixture) => [
          ...cliBase(url, fixture, local, workspaceForm),
          'issue',
          'comment',
          'create',
          traceIssues[variant].identifier,
          '--body',
          `Daily trace comment body ${trial + 1}`,
        ]),
        async verify(results) {
          const verification = {};
          for (const variant of ['before', 'after']) {
            const comment = parseJson(
              results[variant].stdout,
              `${variant} comment`,
            ).current;
            assert.equal(comment.issueId, issues[variant].id);
            assert.equal(comment.body, body);
            assert.equal(comment.version, 1);
            const comments = expectSuccess(
              await request(
                `/workspaces/${fixtures[variant].workspace.id}/issues/${issues[variant].id}/comments`,
              ),
              `verify ${variant} comment`,
            );
            assert.equal(
              comments.filter((item) => item.body === body).length,
              1,
            );
            verification[variant] = {
              issueId: comment.issueId,
              commentId: comment.id,
              version: comment.version,
            };
          }
          return verification;
        },
      };
    },
  };
}

export function createDailyWorkloads(options) {
  return [
    listWorkload(options),
    filteredListWorkload(options),
    createWorkload(options),
    updateWorkload(options),
    commentWorkload(options),
  ];
}
