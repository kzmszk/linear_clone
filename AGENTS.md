# Implementation quality

The user requires readable, maintainable source code. These are acceptance criteria, not optional cleanup after features work.

This is primarily a personal tool, with at most 3–5 teammates. Choose the simplest implementation that supports that use. Do not design for public SaaS scale or hypothetical future consumers.

- Add failure handling in proportion to likelihood, impact, and recovery cost. Preserve committed data, authorization, and the requested 100 concurrent writes. Rare, non-destructive failures may return a clear error and require a manual retry.
- Do not add generic recovery frameworks, persistent browser command queues, fallback providers, or background repair jobs without a demonstrated need. A documented manual procedure is sufficient when recovery is simple.
- Validate external input at boundaries and trust validated internal types. Avoid speculative guards, retries, and fallback branches throughout business logic.
- Keep abstractions tied to current callers. Do not introduce extension points, interchangeable backends, or configuration options solely for possible future requirements.

- Give each module one coherent responsibility and each function a clear purpose. Keep HTTP, authorization, persistence, import conversion, and UI state in their documented owners; see `docs/modules.md`.
- Split by responsibility. Do not move arbitrary chunks into helpers merely to pass line or complexity limits. Avoid one-call forwarding wrappers and excessive indirection.
- Keep each business rule in one owner. When the same rule appears in Web, CLI, and Worker, put authoritative enforcement in the Worker and share input contracts. Similar syntax alone does not justify a generic abstraction.
- Name functions after their observable behavior, including significant side effects. A `getIssue` function must not create or update an issue; use a name such as `createIssue` for that operation. Avoid vague names such as `handleData` or `processItem` when a domain-specific verb is available.
- Before each implementation commit, review changed code for mixed responsibilities, unnecessary branches, duplicated rules, misleading names, and indirection. Passing lint does not replace this review.
- Use `.oxlintrc.json` to reject oversized files/functions, excessive branching, and deep nesting. Do not raise limits or add blanket exclusions to make new code pass. A narrow exception requires a concrete reason in the change and review of the affected code.
- Verify behavior through the real public API, CLI, and browser as appropriate. Follow `docs/verification.md`; do not add tests that merely repeat implementation details.

The user explicitly excluded `aha-setup`; do not apply its instructions.
