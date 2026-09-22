import assert from 'node:assert/strict';

function expectSuccess(result, operation) {
  assert.ok(
    result.status >= 200 && result.status < 300,
    `${operation} failed with ${result.status}: ${JSON.stringify(result.body)}`,
  );
  return result.body;
}

function jsonOutput(result) {
  return JSON.parse(result.stdout);
}

async function createProject(request, fixture, name) {
  const result = await request(`${fixture.base}/projects`, {
    method: 'POST',
    body: { name, status: 'planned', teamIds: [fixture.team.id] },
  });
  return expectSuccess(result, `create project ${name}`).current;
}

async function createIssue(request, fixture, fields) {
  const result = await request(`${fixture.base}/issues`, {
    method: 'POST',
    body: { teamId: fixture.team.id, ...fields },
  });
  return expectSuccess(result, `create issue ${fields.title}`).current;
}

async function readIssue(request, fixture, issueId) {
  const result = await request(`${fixture.base}/issues/${issueId}`);
  return expectSuccess(result, `read issue ${issueId}`);
}

function comparableIssue(issue) {
  return {
    title: issue.title,
    teamId: issue.teamId,
    stateId: issue.stateId,
    projectId: issue.projectId,
  };
}

function commonArgs(runtimeUrl, fixture) {
  return [
    '--url',
    runtimeUrl,
    '--test-email',
    'owner@example.test',
    '--workspace',
    fixture.workspaceId,
    '--json',
  ];
}

function helpWorkload() {
  return {
    name: 'help',
    command: 'linc --help',
    async prepareTrial() {
      return {
        args: ['--help'],
        async verify(results) {
          assert.match(results.before.stdout, /Usage: linc/u);
          assert.match(results.after.stdout, /Usage: linc/u);
        },
      };
    },
  };
}

function listWorkload(request, fixture, project, baseArgs, expectedIds) {
  return {
    name: 'project-filtered-list',
    command: 'linc issue list --project <name>',
    async prepareTrial() {
      return {
        args: [...baseArgs, 'issue', 'list', '--project', project.name],
        async verify(results) {
          const beforeIds = jsonOutput(results.before)
            .map(({ id }) => id)
            .sort();
          const afterIds = jsonOutput(results.after)
            .map(({ id }) => id)
            .sort();
          assert.deepEqual(beforeIds, expectedIds);
          assert.deepEqual(afterIds, expectedIds);
          const apiResult = await request(
            `${fixture.base}/issues?projectId=${encodeURIComponent(project.id)}`,
          );
          const savedIds = expectSuccess(apiResult, 'verify filtered list')
            .items.map(({ id }) => id)
            .sort();
          assert.deepEqual(savedIds, expectedIds);
        },
      };
    },
  };
}

function createWorkload(request, fixture, project, baseArgs) {
  return {
    name: 'create-with-team-and-project',
    command: 'linc issue create --team <key> --project <name>',
    async prepareTrial(trial) {
      const title = `CLI benchmark create ${trial + 1}`;
      return {
        args: [
          ...baseArgs,
          'issue',
          'create',
          '--team',
          fixture.team.key,
          '--project',
          project.name,
          '--title',
          title,
        ],
        async verify(results) {
          const before = jsonOutput(results.before).current;
          const after = jsonOutput(results.after).current;
          assert.deepEqual(comparableIssue(before), comparableIssue(after));
          for (const issue of [before, after]) {
            const saved = await readIssue(request, fixture, issue.id);
            assert.deepEqual(comparableIssue(saved), comparableIssue(issue));
          }
        },
      };
    },
  };
}

function updateWorkload(request, fixture, project, state, baseArgs) {
  return {
    name: 'update-by-identifier-with-state-and-project',
    command: 'linc issue update <identifier> --state <name> --project <name>',
    async prepareTrial(trial) {
      const issues = {
        before: await createIssue(request, fixture, {
          title: `CLI benchmark update before ${trial + 1}`,
        }),
        after: await createIssue(request, fixture, {
          title: `CLI benchmark update after ${trial + 1}`,
        }),
      };
      const argsFor = (issue) => [
        ...baseArgs,
        'issue',
        'update',
        issue.identifier,
        '--state',
        state.name,
        '--project',
        project.name,
      ];
      return {
        args: {
          before: argsFor(issues.before),
          after: argsFor(issues.after),
        },
        async verify(results) {
          const before = jsonOutput(results.before).current;
          const after = jsonOutput(results.after).current;
          assert.equal(before.id, issues.before.id);
          assert.equal(after.id, issues.after.id);
          assert.equal(before.stateId, state.id);
          assert.equal(after.stateId, state.id);
          assert.equal(before.projectId, project.id);
          assert.equal(after.projectId, project.id);
          for (const issue of [before, after]) {
            const saved = await readIssue(request, fixture, issue.id);
            assert.equal(saved.stateId, state.id);
            assert.equal(saved.projectId, project.id);
            assert.equal(saved.version, 2);
          }
        },
      };
    },
  };
}

export async function createBenchmarkWorkloads(request, fixture, runtimeUrl) {
  const firstProject = await createProject(
    request,
    fixture,
    'CLI benchmark project A',
  );
  const secondProject = await createProject(
    request,
    fixture,
    'CLI benchmark project B',
  );
  const metadata = expectSuccess(
    await request(`${fixture.base}/metadata`),
    'read fixture metadata',
  );
  const state = metadata.states.find(({ type }) => type === 'started');
  assert.ok(state, 'fixture must have a started workflow state');
  const listedIssues = [];
  for (let index = 0; index < 6; index += 1) {
    listedIssues.push(
      await createIssue(request, fixture, {
        title: `CLI benchmark list ${index + 1}`,
        projectId: firstProject.id,
      }),
    );
  }
  const baseArgs = commonArgs(runtimeUrl, fixture);
  const expectedIds = listedIssues.map(({ id }) => id).sort();
  return [
    helpWorkload(),
    listWorkload(request, fixture, firstProject, baseArgs, expectedIds),
    createWorkload(request, fixture, secondProject, baseArgs),
    updateWorkload(request, fixture, secondProject, state, baseArgs),
  ];
}
