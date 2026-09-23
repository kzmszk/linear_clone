# FUCHIKOMA-26 to 29

- [x] Read the Principles section of the Poteto Mode skill.
- [x] Phase A: Frame.
- [x] Phase B: Design the workflow.
- [x] Phase C: Run the loop.
- [x] Phase D: Keep the audit trail.
- [x] Phase E: Verify and hand back.

## Definition of done

All four ticket acceptance criteria pass against a local Worker and its SQLite binding. API, normal CLI, local-first CLI, and browser checks cover the paths named by each ticket. The repository check suite passes. Each fix has its own reviewable commit. Production ticket status changes only after the code is deployed and checked there.

## Scope and order

Four independent defects affect the mutation boundary, issue references, workflow states, and access revocation. First capture failing tests. Then fix FUCHIKOMA-26, FUCHIKOMA-28, FUCHIKOMA-27, and FUCHIKOMA-29. Each unit ends with its relevant API or browser test and a commit. Run the full check suite and inspect the diff after the four units.

## Rigor and checkpoint

Use high rigor for authorization and persisted data. Use the existing Worker and SQLite test runtime. Test one observable scenario per rule rather than building a new framework. After the failing cases are established, report the root causes and any change to the order before implementing.
