import { startRuntime } from './runtime.mjs';

const runtime = await startRuntime(8901);
process.stdout.write(`Test Worker listening at ${runtime.url}\n`);
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, async () => {
    await runtime.stop();
    process.exit(0);
  });
}
