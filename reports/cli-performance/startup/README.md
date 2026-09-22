# CLI startup follow-up

Zod namespace imports reduce the CLI bundle from 1,025,897 to 461,549 bytes, a 55.0% reduction. Root help improves from 54.053 to 43.809 ms, a 19.0% reduction in elapsed time. Validation remains enabled.

The baseline is `0dcec3b`, after the earlier batch and reference improvements. These are additional gains, not cumulative improvements from the original CLI.

## Measurements

| Workload                              | Before median | After median | Ratio of medians |
| ------------------------------------- | ------------: | -----------: | ---------------: |
| Root help, 30 pairs                   |     54.053 ms |    43.809 ms |           1.234× |
| Issue help, 30 pairs                  |     53.438 ms |    43.543 ms |           1.227× |
| Issue create help, 30 pairs           |     53.155 ms |    43.920 ms |           1.210× |
| Import help, 30 pairs                 |     52.870 ms |    43.083 ms |           1.227× |
| Filtered list, local Worker, 20 pairs |     88.172 ms |    78.420 ms |           1.124× |
| Create, local Worker, 20 pairs        |     90.334 ms |    81.619 ms |           1.107× |
| Update, local Worker, 20 pairs        |    105.795 ms |    96.536 ms |           1.096× |

[Help samples](help.json) and [local command samples](local-commands.json) include artifact hashes, Node version, alternating execution order, individual times, medians, and nearest-rank p95. Both use Node v26.8.1 on the same Linux machine. Timing runs from process spawn through child close. Verification and fixture setup are excluded. Help output must match and be nonempty, with empty stderr. The local benchmark verifies saved records through the real Worker API.

These local measurements do not establish a new production or batch speedup. The earlier 62-operation production result remains 2.47×; the ticket's 3× target remains unmet.

## Why the imports matter

The change replaces `import { z } from 'zod'` with `import * as z from 'zod'` at 22 sites in the CLI dependency graph. With the installed esbuild and Zod versions, namespace imports let the bundler discard unused exports. No schemas, command registrations, or validation rules change.

The final [bundle breakdown](bundle.json) contains 196,590 bytes from Zod, including only its 4,513-byte English locale. The baseline contained 749,394 bytes from Zod, including 366,095 bytes across locale modules. The reduction includes unused Zod APIs as well as other languages. Zod's classic schemas already initialize English messages; no extra locale configuration is needed.

## Deferred loading was not adopted

Zod can load later, but the current CLI imports schemas from command modules, config, error output, and the API client before parsing arguments. Ordinary commands need validation early. Making help entirely Zod-free would require separating command definitions from actions and schemas, then emitting ESM chunks to defer parsing as well as initialization. We did not make that larger refactor.

A smaller prototype placed five dynamic imports of the Linear import library inside actions. With the current single-file build it increased the bundle to 489,307 bytes without improving help latency. In [20 alternating pairs](rejected-lazy-import.json), root help changed from 44.083 to 44.099 ms. We rejected this prototype. The earlier [English-only experiment](english-prototype.json) is exploratory; use the final measurements above for the shipped change.

Independent Sol and Terra design reviews favored namespace imports. Terra reviewed the measurement approach. The comment review found no added comments or suppressions.

## Verification and reproduction

`pnpm check` passed formatting, lint, type checks, builds, production-bundle checks, and all 43 API/CLI/Worker tests. Added tests execute the built CLI and check root/issue help and the English `Invalid URL` error from malformed config. Existing tests cover issue operations, batch ordering/conflicts, and Linear import. Browser E2E was not rerun for this import-only change.

Preserve the before artifact, build the current CLI, and run:

```sh
node scripts/benchmark-cli-startup.mjs \
  --before dist/cli/linc-startup-before.mjs --after dist/cli/linc.mjs \
  --trials 30 --output artifacts/private/startup-help.json
node scripts/benchmark-cli.mjs \
  --before dist/cli/linc-startup-before.mjs --after dist/cli/linc.mjs \
  --trials 20 --output artifacts/private/startup-commands.json
```

To rebuild the baseline, use the archive procedure in [CLI performance](../../../docs/cli-performance.md) with commit `0dcec3b` and the same dependencies. Before SHA-256: `ed541cfbd1b22a793c44f7739579d5b10df6561e0135f27907f65bce021c93de`. After: `2b8d160013b172cbe00d2d98e31f591176442806539a882b0de10f5412a322a4`.

The sandbox initially denied child process creation and produced empty help. The verifier rejected it. Final benchmarks and the full check ran with permission to launch real child processes. Empty-result runs are excluded.
