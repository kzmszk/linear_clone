# Web classification and issue hierarchy

- [x] Read the Poteto Mode principles.
- [x] Phase A: Frame the four user-visible gaps, inspect the current API and UI, and register four Linc issues with observable completion criteria.
- [x] Phase B: Sketch the smallest data and component changes. Capture a failing browser or Worker check before each feature.
- [x] Phase C: Implement labels, states, parent editing, and hierarchy display as separate verified units and commits.
- [x] Phase D: Keep one append-only decision trail with evidence for design changes and checks.
- [x] Phase E: Run repository checks and browser E2E, deploy, verify production, and close the four issues with completion comments.

## Definition of done

In a real browser, a manager can create and remove labels and team statuses. A user can assign and remove labels on an issue, select and clear a parent, and navigate between a parent and its visible children. Used statuses cannot be removed. The Worker remains authoritative for permissions and parent-cycle validation. The affected flows survive reload and are covered by real Worker and browser tests. The four Linc issues are completed only after the deployed Web UI and API have been checked.

## Scope and rigor

Four feature units touch Web settings, issue detail, metadata queries, and one missing Worker status-delete path. Preserve existing data and private-team visibility. Use high rigor for server mutations and authorization, with a migration check if state archival needs schema storage. Use the existing Playwright and local Worker setup for user-visible checks. Do not add generic UI or recovery frameworks.

The registered units are FUCHIKOMA-30 (labels), FUCHIKOMA-31 (statuses), FUCHIKOMA-32 (parent editing), and FUCHIKOMA-33 (hierarchy display). About a dozen existing modules will need changes across contracts, Worker, Web, and tests. After the first Web unit, check whether its form/query pattern stays small enough to reuse for the second. If not, keep the two panels independent.
