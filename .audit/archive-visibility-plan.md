# Archived resources in Web

## Observable outcome

The normal workspace picker, resource navigation, settings lists, and issue list show active records only. The single Archived destination exposes archived issues, projects, teams, labels, statuses, and workspaces. A manager can restore an archived resource there. An account with only archived workspaces can still open the archive and restore one. Trash remains for deleted issues and is separate from Archive.

## Design decision

The user replaced permanent deletion with archive visibility. All partial purge code was discarded before this work began. Existing records and archive timestamps remain intact. UI issue navigation uses one scope (`active`, `archived`, `trash`) instead of adding another independent boolean. Worker collection endpoints retain active-only defaults and accept `includeArchived=true` only when the Archive view asks for it. The account response continues to include archived workspaces; Web filters them in ordinary views so Archive can still list them. This avoids a data migration or destructive operation.

## Throughput checkpoint

- Blocking first steps: audit every archive field and every normal display surface; identify the existing restore paths.
- Independent workstreams: Worker list/contract work and Web navigation/view work own disjoint files and run in parallel.
- Shared mutable state: both use one checkout but edit separate paths; repository-wide checks and commits are serialized after the combined diff review.
- Smallest safe decomposition: one Worker owner, one Web owner, root owns design, docs, integration tests, and release verification.

## Verification

- Real API tests: default lists and metadata omit archived records; explicit archive lists return them; restore removes their archive marker.
- Browser E2E: archive from normal settings/detail; active navigation and selectors lose the item; Archive lists it; restore returns it; reload preserves the result.
- Browser E2E: no active workspace still presents archived workspaces and a restore path. Trash and archived issues remain distinct.
- Run format, lint, typecheck, build, relevant API tests, full browser E2E, and source quality checks. Do not touch production data for verification.

## Outcome

The Worker, Web, and contracts changes implement the scope above without a data migration or permanent deletion. `pnpm check` passed 98 API/CLI tests, `pnpm test:e2e` passed 49 browser tests, and `pnpm quality` reported no unused-code findings or threshold violations. Browser tests use a disposable local Worker and leave production records unchanged.
