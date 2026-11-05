# Manage compensatory coverage

Coverage is independent of approval, request consumption and the hour bank. A request can be approved before a replacement is identified; registering coverage never credits the replacement automatically.

## Coordination workflow

1. In **Programados**, open **Gestionar cobertura** for an approved request. The request detail also provides this action for approved or consumed requests.
2. Enter the service start/end in Buenos Aires local time. The start date must match the request date, and the interval must match its canonical requested minutes. Explicit end dates support overnight intervals.
3. Add one or more active replacement agents and their intervals. The requester cannot cover their own request. Intervals must stay inside the plan and must not overlap each other.
4. Confirm an assignment only after recording how availability was checked. This administrative check does not claim that a complete roster/calendar was validated automatically.
5. Review the plan and supply a reason, then save. Changes retain actor, time, before/after snapshots and an independent coverage version.

**Pending** means no coverage has been assigned. **Partial** includes unconfirmed assignments and confirmed intervals that leave gaps. **Confirmed** requires the complete planned interval to be covered by confirmed assignments. Known overlapping coverages for the same replacement on other live requests are rejected; adjacent intervals are allowed.

## Failure and concurrency handling

Retry an uncertain operation from the same dialog without changing its frozen payload. A version conflict requires explicitly reloading and reviewing current coverage. A saved plan remains saved even if refreshing the parent view fails.

Coverage locks replacement and requester rows in sorted order before the request, so its active-staff check shares the locking protocol used by staff deactivation. It does not write the ledger, reservations, request decision or public form.

## Installation and verification

Migration `0032_careful_stardust.sql` has been applied once to the verified loopback local working copy after a custom-format PostgreSQL18 backup was verified. Independent read-only checks matched all journal hashes and the four new empty tables against the migration/snapshot. This does not authorize production deployment or a migration rerun. No coverage records were loaded.

Service/helper/schema tests, typecheck, build and synthetic-browser checks passed. The pre-correction full suite had 918/919 tests passing, with the known unchanged EFA wording assertion; the locking correction received focused independent rechecks afterward. Nine real-PostgreSQL checks then passed using actual service/adapter and migration 0032 in a unique synthetic schema, including an actual staff-deactivation row-lock wait and rejection, rollback and unchanged-state hashes. Only migration foreign-key targets were redirected; prerequisite tables were minimal and synthetic, not a full historical replay. Cleanup was confirmed and the parent repeated the checks successfully. The later authorized working-copy migration was checked separately; the applying actor reports unchanged pre/post fingerprints, while the independent verifier lacked the baseline values for an independent preservation comparison. Browser scaling produced a 500 CSS-pixel viewport, so a precise 390-pixel phone check and user visual acceptance remain pending.
