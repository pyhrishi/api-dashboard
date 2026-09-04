# Edge-Case Matrix

Walk every row for the feature. For each applicable one, decide the behavior **in the
Architecture Brief** and implement it. "N/A" is a valid answer — "didn't think about it" is not.

## Data volume & shape
| Case | Decide |
|---|---|
| First use / zero data | Empty state: icon + why it's empty + the next action |
| One item | Layout still looks intentional (no lonely table) |
| Huge data (10k+ rows, long lists) | Pagination or virtualization; server-side filter; never render everything |
| Very long strings / unicode / emoji | Truncate + tooltip; no overflow breaking layout |
| Missing / null / partial fields | Graceful fallbacks ("—"), never `undefined` on screen |
| Stale data | Show "last updated"; refresh affordance |

## Network & API
| Case | Decide |
|---|---|
| Slow response (>2s) | Skeleton/progress; keep the UI interactive; don't double-submit |
| Failure (4xx/5xx) | Human error + how to fix + retry; map gateway codes (401/402/403/406/429/451) |
| Partial success (batch) | Per-item status; summarize; let user retry failures only |
| Rate limited (429) | Explain the limit, when it resets, and the upgrade path |
| Offline / timeout | Detect, tell the user, queue or retry |
| Idempotency | Retries can't double-charge or duplicate (use idempotency keys where billed) |

## Permissions & scope
| Case | Decide |
|---|---|
| Role can't do it (`admin` / `developer` / `billing`) | Hide or disable with a *why*; guard the store mutation too |
| Sandbox vs live | Behavior/copy differences (free vs billed, masked vs unmasked); disabled-in-sandbox where relevant |
| Tenant switch mid-flow | State is org-scoped; switching doesn't leak or corrupt; in-flight work is handled |
| Environment switch mid-flow | Same as above for sandbox/live |

## State & lifecycle
| Case | Decide |
|---|---|
| Reload / persistence | What survives (`partialize`)? Drafts? Filters? |
| Concurrent edits (two tabs / two users) | Last-write-wins or conflict notice; no silent loss |
| Undo / destructive actions | Confirm; where possible make reversible (soft delete, revert) |
| In-flight navigation | Don't strand a half-finished mutation; warn on unsaved changes |
| Time | Timezones, month boundaries (MTD math), relative times that don't go stale |

## Input & security
| Case | Decide |
|---|---|
| Invalid input | Inline validation with precise messages; disable submit until valid |
| Malicious input (XSS/SQLi-looking) | Escaped rendering; WAF path if it hits the API |
| Currency / locale | Consistent formatting (`Intl`), explicit currency |
| Copy / export | Clipboard + download states; redaction respected on export |

## Accessibility & devices
| Case | Decide |
|---|---|
| Keyboard only | All actions reachable; visible focus; Esc closes overlays |
| Screen reader | Labels, roles, live regions for async results |
| Small viewport | Layout collapses gracefully; tables scroll horizontally inside their container |
| Reduced motion | Respect `prefers-reduced-motion` |
| Light + dark | Semantic tokens make this automatic — verify both |
