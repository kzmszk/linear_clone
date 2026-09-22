import { Command } from 'commander';
import { login } from './auth.ts';
import { defaultUrl } from './config.ts';
import { registerIssueCommands } from './issues.ts';
import { registerImportCommands } from './import-commands.ts';
import { registerManagementCommands } from './management.ts';
import { optionsFor, printValue } from './output.ts';

type ProgramOptions = {
  configure?: (program: Command) => void;
  suppressCommanderOutput?: boolean;
};

function registerAuthCommand(program: Command): void {
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
}

export function createProgram(options: ProgramOptions = {}): Command {
  const program = new Command();
  program
    .name('linc')
    .description('A small Linear-compatible issue tracker client')
    .option('--url <url>', 'Linc URL (defaults to the saved login destination)')
    .option('--workspace <slug-or-id>', 'workspace slug or UUID')
    .option('--json', 'print machine-readable JSON', false)
    .option(
      '--test-email <email>',
      'local development identity; only accepted for localhost URLs',
    )
    .showHelpAfterError();

  if (options.suppressCommanderOutput) {
    program.exitOverride();
    program.configureOutput({ writeOut() {}, writeErr() {} });
  }
  program.hook('preAction', async () => {
    if (program.opts().url === undefined)
      program.setOptionValue('url', await defaultUrl());
  });

  registerAuthCommand(program);
  registerManagementCommands(program);
  registerIssueCommands(program);
  registerImportCommands(program);
  options.configure?.(program);

  program.action(async (_, command) => {
    const globalOptions = optionsFor(command);
    program.help({ error: false });
    if (globalOptions.json)
      printValue(
        { error: { code: 'usage', message: 'Provide a command.' } },
        true,
      );
  });
  return program;
}
