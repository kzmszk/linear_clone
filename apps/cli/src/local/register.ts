import type { Command } from 'commander';

export function registerLocalCommands(root: Command): void {
  const local = root
    .command('local')
    .description('Use the local-first workspace');
  local.command('init').action(async (_, command) => {
    const { initializeLocal } = await import('./commands.ts');
    await initializeLocal(command);
  });
  local.command('sync').action(async (_, command) => {
    const { syncLocal } = await import('./commands.ts');
    await syncLocal(command);
  });
  local.command('status').action(async (_, command) => {
    const { showLocalStatus } = await import('./commands.ts');
    await showLocalStatus(command);
  });
  local
    .command('watch')
    .option('--interval <seconds>', 'seconds between sync attempts', '5')
    .action(async (_, command) => {
      const { watchLocal } = await import('./commands.ts');
      await watchLocal(command);
    });
  local
    .command('discard')
    .requiredOption('--yes', 'discard all reconciled pending operations')
    .action(async (_, command) => {
      const { discardLocal } = await import('./commands.ts');
      await discardLocal(command);
    });
  registerLocalIssueCommands(local);
}

function registerLocalIssueCommands(local: Command): void {
  const issue = local.command('issue').description('Manage local issues');
  issue
    .command('create')
    .requiredOption('--team <team>')
    .requiredOption('--title <title>')
    .option('--description <text>')
    .option('--description-file <path>')
    .option('--state <state>')
    .option('--priority <number>', '0')
    .option('--assignee <member>')
    .option('--project <project>')
    .option('--parent <issue>')
    .option('--estimate <number>')
    .option('--due-date <date>')
    .option('--label <label...>')
    .action(async (_, command) => {
      const { createLocalIssue } = await import('./issue-commands.ts');
      await createLocalIssue(command);
    });
  issue
    .command('list')
    .option('--team <team>')
    .option('--state <state>')
    .option('--assignee <member>')
    .option('--project <project>')
    .option('--search <text>')
    .option('--archived', 'show archived issues')
    .option('--deleted', 'show deleted issues')
    .option('--closed', 'show completed and canceled issues')
    .option('--all', 'show open, completed, and canceled issues')
    .action(async (_, command) => {
      const { listLocalIssues } = await import('./issue-commands.ts');
      await listLocalIssues(command);
    });
  issue
    .command('get')
    .argument('<identifier>')
    .action(async (identifier, _options, command) => {
      const { getLocalIssue } = await import('./issue-commands.ts');
      await getLocalIssue(command, identifier);
    });
  registerLocalIssueWrites(issue);
  registerLocalCommentCommands(issue);
}

function registerLocalIssueWrites(issue: Command): void {
  issue
    .command('update')
    .argument('<identifier>')
    .option('--title <title>')
    .option('--description <text>')
    .option('--description-file <path>')
    .option('--clear-description')
    .option('--state <state>')
    .option('--priority <number>')
    .option('--assignee <member>')
    .option('--unassign')
    .option('--project <project>')
    .option('--clear-project')
    .option('--parent <issue>')
    .option('--clear-parent')
    .option('--estimate <number>')
    .option('--clear-estimate')
    .option('--due-date <date>')
    .option('--clear-due-date')
    .option('--label <label...>')
    .option('--expected-version <number>')
    .action(async (identifier, _options, command) => {
      const { updateLocalIssue } = await import('./issue-commands.ts');
      await updateLocalIssue(command, identifier);
    });
  for (const name of ['delete', 'restore'] as const)
    issue
      .command(name)
      .argument('<identifier>')
      .option('--expected-version <number>')
      .action(async (identifier, _options, command) => {
        const { changeLocalIssueLifecycle } =
          await import('./issue-commands.ts');
        await changeLocalIssueLifecycle(command, identifier, name);
      });
}

function registerLocalCommentCommands(issue: Command): void {
  const comment = issue.command('comment').description('Manage local comments');
  comment
    .command('list')
    .argument('<identifier>')
    .action(async (identifier, _options, command) => {
      const { listLocalComments } = await import('./issue-commands.ts');
      await listLocalComments(command, identifier);
    });
  comment
    .command('create')
    .argument('<identifier>')
    .option('--body <text>')
    .option('--body-file <path>')
    .option('--parent <comment>')
    .action(async (identifier, _options, command) => {
      const { createLocalComment } = await import('./issue-commands.ts');
      await createLocalComment(command, identifier);
    });
}
