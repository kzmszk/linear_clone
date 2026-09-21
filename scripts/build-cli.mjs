import { build } from 'esbuild';
import { chmod } from 'node:fs/promises';
await build({
  entryPoints: ['apps/cli/src/main.ts'],
  outfile: 'dist/cli/linc.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  banner: { js: '#!/usr/bin/env node' },
});
await chmod('dist/cli/linc.mjs', 0o755);
