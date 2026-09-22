import assert from 'node:assert/strict';
import { cliBase, parseJson } from './benchmark-cli-daily-fixture.mjs';

export function localWorkloads(url, fixtures, localUrl) {
  const base = {
    before: cliBase(url, fixtures.before, localUrl, 'slug'),
    after: [...cliBase(url, fixtures.after, localUrl, 'slug'), 'local'],
  };
  return [
    make(
      base,
      fixtures,
      'issue-list',
      'issue list --state Backlog',
      () => ['issue', 'list', '--state', 'Backlog'],
      (value) => {
        assert.equal(value.length, 20);
        assert.equal(
          value.every((issue) => issue.completedAt === null),
          true,
        );
      },
    ),
    make(
      base,
      fixtures,
      'issue-create',
      'issue create --team BENCH --title TITLE',
      (_, trial) => [
        'issue',
        'create',
        '--team',
        'BENCH',
        '--title',
        `Local benchmark ${trial}`,
      ],
      (value, fixture, trial) => {
        assert.equal(value.title, `Local benchmark ${trial}`);
        fixture.createdIds.push(value.id);
      },
    ),
    make(
      base,
      fixtures,
      'issue-update',
      'issue update ID --state STATE',
      (fixture, trial) => [
        'issue',
        'update',
        fixture.issueIds.open[0],
        '--state',
        trial % 2 ? 'Backlog' : 'In Progress',
      ],
      (value, fixture, trial) => {
        assert.equal(
          value.stateId,
          trial % 2 ? fixture.states.open.id : fixture.states.started.id,
        );
      },
    ),
    make(
      base,
      fixtures,
      'comment-create',
      'issue comment create ID --body BODY',
      (fixture, trial) => [
        'issue',
        'comment',
        'create',
        fixture.issueIds.open[0],
        '--body',
        `Local comment ${trial}`,
      ],
      (value, fixture, trial) => {
        assert.equal(value.body, `Local comment ${trial}`);
        fixture.commentIds.push(value.id);
      },
    ),
  ];
}

function make(base, fixtures, name, command, args, verify) {
  return {
    name,
    command,
    async prepareTrial(trial) {
      return {
        args: Object.fromEntries(
          ['before', 'after'].map((variant) => [
            variant,
            [...base[variant], ...args(fixtures[variant], trial)],
          ]),
        ),
        async verify(results) {
          for (const variant of ['before', 'after']) {
            const value = parseJson(results[variant].stdout, name);
            verify(value.current ?? value, fixtures[variant], trial);
          }
        },
      };
    },
  };
}
