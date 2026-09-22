import { build } from 'esbuild';
import { chmod } from 'node:fs/promises';
await build({
  entryPoints: ['apps/cli/src/main.ts'],
  outfile: 'dist/cli/linc.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  banner: {
    js: "#!/usr/bin/env node\nimport { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});
await chmod('dist/cli/linc.mjs', 0o755);
