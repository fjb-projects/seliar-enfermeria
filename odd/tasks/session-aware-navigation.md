# Separate public and private navigation

Public mobile navigation gains Login. Authentication replaces its public actions with the existing private quick actions; private Inicio returns to the panel and successful Logout returns to the public landing. Compact mobile headers and move desktop navigation above the content.

## Authorized outcome

- Public navigation: Inicio to `/`, existing guard/management groups and Login to `/login`.
- Authenticated navigation: Inicio to `/panel`, private panel quick actions according to permissions and guard state, and Logout. Replace public groups instead of appending private options.
- Successful Logout ends the session before returning to `/`. Failed logout preserves the authenticated UI and shows nearby feedback.
- Opening `/` with an active session returns to `/panel`. Login preserves supported private return destinations, including EFA routes.
- Shared private action definitions and session/guard snapshots serve panel and navigation; avoid duplicating permissions or fetching the full panel summary on each navigation.
- Mobile: reduce vertical padding while preserving 44–48 px touch targets. Bottom navigation is mobile-only. Desktop: corresponding navigation above content with every applicable destination, no reserved bottom-bar whitespace.

## Constraints

- User requests manual review: no tests, test edits, build, typecheck, formatter, diff check or browser QA. Source readback only; do not claim runtime proof.
- No database connections, migration execution, credentials, remote sessions, push, PR or deployment. Participation migration 0022 remains unrelated and not applied.
- Preserve unrelated dirty files and staged deletions. Existing root error translation and login password visibility control remain in the worktree but outside this feature commit.
- Existing authentication and server authorization guards remain authoritative. Treat unreadable session separately from confirmed anonymous/expired session. Refresh shared private state after relevant guard changes and scope any cache to the current account.
- Neutral Spanish UI extending the app, with explicitly requested Login/Logout labels. English code and technical documentation.

## Work unit

| ID | Outcome | Route | Status |
| --- | --- | --- | --- |
| N1 | Session-aware public/private navigation, shared quick actions and compact responsive placement | Delegated: multi-file state/routing/component integration | Complete by source review; commit 8c07990 |

One coherent unit keeps session state, quick actions, login/logout destinations and responsive rendering compatible. Separate foundation/UI commits would leave incomplete navigation integration.

## Acceptance and review (source inspection; runtime pending)

- [x] Anonymous mobile has Login; authenticated navigation replaces public groups with applicable private quick actions.
- [x] Private Inicio targets the panel; Logout reaches public landing only after session termination; private return destinations survive login.
- [x] Shared action definitions preserve read-only EFA consultation and admin-only administration, with guard-dependent write actions.
- [x] Guard/session snapshots are account scoped, with invalidation after successful guard mutations and mobile confirmations.
- [x] Both public and private headers are compact on mobile; equivalent desktop navigation remains accessible and bottom spacing is responsive.
- [x] Existing keyboard/menu focus behavior and touch target styles remain available.
- [x] Independent source review and parent structural readback complete; manual runtime checks explicitly pending.

## Evidence and delivery

Starting boundary: f3251a08f98369737aff930c6cf9387e19158b68 on codex/efa-ui-mobile-integrator. Cached delivery strategy: feature-branch-chain; no publishing. Forecast 500–800 authored changed lines including shared state integration, advisory only. Keep one coherent work unit; do not compress code or omit behavior for the estimate.

Explorer confirmed global SeliarMobileNav currently lacks session and desktop visibility rules. EfaPanelHome already derives quick actions from canWrite/isAdmin/openGuard. WorkflowHeader serves flows, while public index has its own header. The panel loader alone currently owns its summary; root integration needs shared state with explicit freshness rather than full-summary fetches on every route. Safe private return destinations currently omit the EFA routes. RDD is clone-local off; do not start or enable native review. An unavailable assessment remains high for independent static readback.

Source review is the applicable check because the user explicitly excludes executable verification. Rollback will cover only this unit's owned navigation/session/quick-action/routing/header changes; preserve prior EFA work and human baseline edits. Parent records exact source commit and observed checks after the handoff.

## Progress and next step

N1 source implementation and independent static review are complete. Review found one SSR cache hydration gap and the bounded writer corrected it in the additional exact authorized surface src/router.tsx. Installed router hooks now transport successful queries, exclude mutations and hydrate each router instance's own QueryClient before client rendering. Independent targeted readback closed the finding; parent read back router/provider structure. No runtime proof was produced.

The 15 source surfaces implement shared session snapshots (15-second freshness), account-scoped guard summaries (30-second freshness), explicit mutation/confirmation invalidation and no polling. src/components/EfaGuardPanel.tsx changes only refresh the shared summary after success. Anonymous/expired session is distinct from a read failure. Logout preserves private state on failure and returns to the public landing only after success.

RDD remains clone-local off. Native assessment could not classify the candidate because of unrelated untracked inventory; it was treated as high/unassessable and received independent source review. No native review lifecycle started. Tests, test edits, build, typecheck, formatter, diff check, browser QA, database work and remote delivery were explicitly skipped under the user's instruction. Manual Login/navigation/Logout/guard-state/responsive checks remain pending for the user.

Local work-unit commit: 8c0799010b8f7ac26b982c013d97bab3185b576b, `feat(nav): switch responsive navigation with session state`. It contains 15 source files plus this feature document: 717 additions and 198 deletions, 854 authored source lines excluding the 61-line tracking document. The larger coherent unit includes shared state, failure/expiry handling, responsive menus and SSR cache transport. Keep the cached feature-branch-chain delivery strategy; this is one local slice, with no remote PR or publishing.

A temporary Git index excluded the captured preexisting human root error translation from the commit. Git status and the remaining root diff confirm that translation, the original login password toggle and all unrelated staged/dirty work remain. The two bootstrap script deletions remain staged. Source paths introduced by this feature are clean. RDD outcome: disabled/unmanaged; source review is not runtime approval.

Next step: user manually checks public mobile Login, authenticated private quick actions, private Inicio, successful/failed Logout, guard state updates and desktop/mobile spacing. No source work remains under N1. Parent owns this file and its full recovery mirror.

## Recovery mirror

Repository-relative locator: odd/tasks/session-aware-navigation.md.
Engram topic: odd/session-aware-navigation/tasks.
