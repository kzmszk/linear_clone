import assert from 'node:assert/strict';

export async function requestValue(request, route, options) {
  const response = await request(route, options);
  assert.ok(
    response.status >= 200 && response.status < 300,
    `HTTP ${response.status}: ${JSON.stringify(response.body)}`,
  );
  return response.body;
}

export function buildWorkflow(teamKey, projectA, projectB, states) {
  const commands = [projectA, projectB].map((name) => [
    'project',
    'create',
    '--name',
    name,
    '--team',
    teamKey,
  ]);
  for (const project of [projectA, projectB]) {
    for (let index = 1; index <= 10; index += 1)
      commands.push([
        'issue',
        'create',
        '--team',
        teamKey,
        '--project',
        project,
        '--title',
        `${project} issue ${index}`,
      ]);
  }
  for (let index = 1; index <= 10; index += 1)
    commands.push([
      'issue',
      'update',
      `${teamKey}-${index}`,
      '--state',
      states.started.id,
    ]);
  for (let index = 11; index <= 20; index += 1)
    commands.push([
      'issue',
      'update',
      `${teamKey}-${index}`,
      '--project',
      projectA,
    ]);
  for (let index = 1; index <= 20; index += 1)
    commands.push([
      'issue',
      'update',
      `${teamKey}-${index}`,
      '--state',
      states.completed.id,
    ]);
  assert.equal(commands.length, 62);
  return commands;
}

export async function verifyWorkflow(request, base, team, names, completed) {
  const projects = await requestValue(request, `${base}/projects`);
  const first = projects.find((project) => project.name === names[0]);
  const second = projects.find((project) => project.name === names[1]);
  assert.ok(first && second);
  const issues = (
    await requestValue(request, `${base}/issues?teamId=${team.id}`)
  ).items;
  assert.equal(issues.length, 20);
  assert.equal(new Set(issues.map((issue) => issue.id)).size, 20);
  assert.deepEqual(
    issues.map((issue) => issue.title).sort(),
    names
      .flatMap((name) =>
        Array.from({ length: 10 }, (_, index) => `${name} issue ${index + 1}`),
      )
      .sort(),
  );
  for (const issue of issues) {
    assert.equal(issue.projectId, first.id);
    assert.equal(issue.stateId, completed.id);
    assert.equal(issue.version, 3);
  }
  const empty = await requestValue(
    request,
    `${base}/issues?projectId=${second.id}`,
  );
  assert.deepEqual(empty.items, []);
  return {
    issues: 20,
    allInProjectA: true,
    projectBEmpty: true,
    allCompleted: true,
    allVersion3: true,
  };
}
