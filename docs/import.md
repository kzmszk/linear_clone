# Linear import

The importer reads Linear through the existing authenticated `linear` CLI and
writes a private export directory. It does not extract or print the Linear
CLI's credentials, and it never sends mutations to Linear.

## Authenticate the source

Install and authenticate the Linear CLI first, then check the selected
workspace:

```sh
linear auth login
linear auth whoami
```

The exporter runs `linear api --paginate` for the organization, metadata,
issues, comments, history, relations, and attachments. Use
`--source-workspace <slug>` when the Linear CLI has more than one workspace
credential:

```sh
linear auth default my-workspace
```

If Linear-hosted files require an API key, provide `LINEAR_API_KEY` in the
process environment before exporting. The key is used only for the allowlisted
Linear file request; it is never a command argument, log value, or export
record.

## Export and inspect

Choose a new private directory for each export. The exporter creates the
directory with mode `700` and writes raw records and files with mode `600`.
Do not commit or upload this directory.

```sh
linc import linear export \
  --output ./artifacts/private/linear-export \
  --source-workspace my-workspace

linc --json import linear plan ./artifacts/private/linear-export
linc --json import linear verify --local-only ./artifacts/private/linear-export
```

The default export downloads Linear-hosted files from `linear.app` and its
subdomains. `--skip-files` leaves those binaries out of the export and reports
them as missing. Links to other hosts are retained as external attachments
and are not fetched.

## Apply to Linc

Authenticate Linc separately. For a local development worker, pass the test
identity explicitly:

```sh
linc auth login \
  --url http://localhost:8787 \
  --test-email owner@example.test
```

For a Cloudflare Access protected deployment, use the production URL. This
invokes `cloudflared access login` and stores the resulting Access token in the
owner-readable Linc config file:

```sh
linc auth login --url https://tickets.example.com
```

Apply the export to the destination workspace. `--workspace` is the global
destination selection; `--destination-workspace` can be used on `apply` when
the global selection is omitted.

```sh
linc \
  --url https://tickets.example.com \
  --workspace dev \
  import linear apply ./artifacts/private/linear-export
```

The apply checkpoint is `apply.json` in the export directory. Records are sent
in batches of 50, and completed source IDs are recorded before continuing.
If the process or network fails, rerun the same command with the same export
directory. Completed records and uploaded files are skipped safely.

The checkpoint is bound to the Linc URL and destination workspace. To apply an
export to a different destination, make a fresh private copy without the old
`apply.json`; never reuse a checkpoint from another destination.

## Verify the destination

Run destination verification after apply:

```sh
linc --json \
  --url https://tickets.example.com \
  --workspace dev \
  import linear verify ./artifacts/private/linear-export
```

Verification reads the actual destination issues, comments, history,
relations, attachments, metadata, and copied file bytes. A successful result
has `ok: true`, no `mismatches`, no `missing` records, and no `unsupported`
records. The command exits nonzero when any of those checks fail.

## Preserved data and limits

- Archived teams, workflow states, projects, labels, issues, comments, and
  history are included in the export.
- Issue titles, descriptions, status, dates, parents, labels, relations, and
  source IDs are checked against the destination. Copied file URLs replace
  matching Linear file URLs in issue and comment text.
- External attachment URLs remain external URLs. Linear-hosted binaries are
  copied to private Linc storage; the per-file upload limit is 10 MiB.
- Imported authors and assignees retain their source names and identities.
  They do not become Linc users, workspace members, or app login principals.
- Missing source files and unsupported content remain in the report. Resolve
  the reported source problem and export again before treating verification as
  complete.

This is a one-time migration with resumable retries, not continuous two-way
synchronization. A later export of an already imported record does not overwrite
its Linc content. If Linear changed in the meantime, destination verification
reports the difference; choose a fresh destination workspace for a new full
migration or resolve those differences manually.
