import { CommanderError } from 'commander';
import { registerBatchCommand } from './batch.ts';
import { printError } from './output.ts';
import { createProgram } from './program.ts';

const createBatchProgram = () =>
  createProgram({ suppressCommanderOutput: true });
const program = createProgram({
  configure: (root) => registerBatchCommand(root, createBatchProgram),
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
