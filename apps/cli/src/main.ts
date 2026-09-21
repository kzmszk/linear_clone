import { Command, CommanderError } from 'commander';
import { login } from './auth.ts';
import { registerIssueCommands } from './issues.ts';
import { registerImportCommands } from './import-commands.ts';
import { registerManagementCommands } from './management.ts';
import { optionsFor, printError, printValue } from './output.ts';

const program = new Command();
program
  .name('linc')
  .description('A small Linear-compatible issue tracker client')
  .option(
    '--url <url>',
    'Linc URL',
    process.env.LINC_URL ?? 'http://localhost:8787',
  )
  .option('--workspace <slug-or-id>', 'workspace slug or UUID')
  .option('--json', 'print machine-readable JSON', false)
  .option(
    '--test-email <email>',
    'local development identity; only accepted for localhost URLs',
  )
  .showHelpAfterError();

const auth = program.command('auth').description('Manage authentication');
auth
  .command('login')
  .option('--url <url>', 'Linc URL')
  .option('--test-email <email>', 'local development identity')
  .action(async (_, command) => {
    const options = optionsFor(command);
    const commandOptions: unknown = command.opts();
    const localUrl =
      commandOptions &&
      typeof commandOptions === 'object' &&
      'url' in commandOptions &&
      typeof commandOptions.url === 'string'
        ? commandOptions.url
        : options.url;
    const localEmail =
      commandOptions &&
      typeof commandOptions === 'object' &&
      'testEmail' in commandOptions &&
      typeof commandOptions.testEmail === 'string'
        ? commandOptions.testEmail
        : options.testEmail;
    const profile = await login(localUrl, localEmail);
    printValue({ url: profile.url, authenticated: true }, options.json);
  });

registerManagementCommands(program);
registerIssueCommands(program);
registerImportCommands(program);

program.action(async (_, command) => {
  const options = optionsFor(command);
  program.help({ error: false });
  if (options.json)
    printValue(
      { error: { code: 'usage', message: 'Provide a command.' } },
      true,
    );
});

const jsonRequested = process.argv.includes('--json');
try {
  await program.parseAsync(process.argv);
} catch (error) {
  if (
    error instanceof CommanderError &&
    error.code === 'commander.helpDisplayed'
  )
    process.exitCode = 0;
  else process.exitCode = printError(error, jsonRequested);
}
