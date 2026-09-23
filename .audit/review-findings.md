# Access revocation review

Three independent reviews challenged the first FUCHIKOMA-29 implementation. The accepted findings and the tests that prove their fixes are:

| Finding                                                                                                          | Resolution                                                                                                           | Behavioral proof                                                                                  |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| A delayed successful or failed issue mutation could put revoked data back into the cache after the access reset. | Increment a workspace access generation before clearing cache, and ignore mutation callbacks from older generations. | `tests/e2e/team-access.spec.ts` covers both delayed outcomes.                                     |
| Resetting every member's browser after an ordinary team membership update discarded unrelated drafts.            | Send an access close only to the member whose team access decreased.                                                 | `tests/e2e/team-access.spec.ts` keeps the owner's draft while clearing the revoked member's view. |
| A browser that missed the access close during a network cut could keep private data after reconnecting.          | Include accessible team IDs in the socket ready message and reset when the set changes.                              | `tests/e2e/reconnect.spec.ts` covers missed revocation and an ordinary reconnect.                 |

The release includes these fixes in `d378681`. The final local API/CLI, browser, and quality logs are in `verification/`.
