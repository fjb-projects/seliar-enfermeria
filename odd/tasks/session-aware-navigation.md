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
| N2 | Merge desktop navigation, brand and account controls into one compact bar | Delegated: shared layout and account interaction integration | Complete by source review; commit 0af72d3 |
| N3 | Close service introduction with X and remember dismissal for seven days | Delegated: contextual UI and browser storage logic in episode panel | Complete by source review; commit afc9312 |
| N4 | Match pending-view background and soften route loading with a focused overlay | Delegated: installed router mapping and shared transition integration | Complete by source review; commit 6da5ffa |

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

N1 source work is closed. User screenshot revealed a desktop composition issue: the global white navigation and route-owned teal account/brand header stack and duplicate Logout. N2 explicitly supersedes N1's desktop composition acceptance while preserving its session, routes, permissions, cache, SSR and mobile behavior.

## N2: Unified desktop header

Authorized scope: merge the desktop brand, navigation and account controls into one compact top row for public, login and authenticated views. Keep relevant page titles as compact content headings instead of a second full brand strip. Place email and roles in an accessible account dropdown; one desktop Logout, and administrative navigation only in the existing shared quick actions. Preserve mobile layout and navigation.

Exact allowed source surfaces: src/components/SeliarMobileNav.tsx, src/components/PrivateAccountShell.tsx, src/components/WorkflowHeader.tsx, src/routes/index.tsx. Parent owns this task file and its mirror. Existing root/login/badge/button edits and all unrelated staged files are excluded.

Route: delegated writer because reading prepares a four-file visual integration. N2 boundary: 152f5f8. Forecast 120–250 authored source lines, advisory only; cached delivery strategy remains feature-branch-chain, with no publishing. Rollback is this desktop header composition only, leaving N1 session behavior intact.

- [x] Source renders one desktop brand/navigation/account bar for authenticated, anonymous and login views.
- [x] Account email/roles remain accessible and Logout/admin actions are not duplicated in desktop header.
- [x] Page headings remain readable without a second brand band; mobile markup and account controls stay unchanged.
- [x] Independent static source review and parent spot readback complete; runtime checks pending for user.

Checks: source readback only because user expressly requested no executable checks. No tests, build, typecheck, formatter, diff check, browser QA, DB or remote operations. RDD remains clone-local off. Native assessment was high/unassessable because of unrelated untracked inventory, so independent static review ran without any native lifecycle. Writer changed only SeliarMobileNav, WorkflowHeader and public index; PrivateAccountShell remains unchanged. Independent review found one candidate-caused regression: desktop summary error/retry was dropped while mobile retained it. The one bounded correction restored desktop summary failure feedback and retrySummary; independent targeted static readback and parent source spot readback closed this finding. Other inspected navigation/account/mobile behavior had no deterministic blocker. No runtime proof was produced.

N2 source evidence: 109 additions and 60 deletions across three source files, 169 authored source lines. Brand/navigation/account share a compact desktop bar; intermediate widths use a second row inside that bar and XL uses three columns. Existing desktop route/landing headers become compact content headings. Account details use the existing dropdown primitive; one desktop Logout with nearby failure feedback and existing administrative quick actions. Auth/cache/SSR/routing logic is unchanged. Local work-unit commit 0af72d319f5e014e7c4c8acd2b6070159beaba68, `fix(nav): unify desktop branding and account navigation`; accumulated source count N1+N2 is 1023 lines with the cached feature-branch-chain strategy. No PR or publishing. Post-commit Git status preserves the original root/login and unrelated dirty/staged inventory. Rollback N2 only through these three source paths, leaving N1 and human baseline changes intact. RDD outcome remains disabled/unmanaged; no approval or runtime proof claimed.

The original 24-hour notice proposal is superseded: user rejected an explicit hide button and approved a close X with seven-day recurrence remembered in localStorage.

N1/N2 source work is complete; user manual navigation checks remain pending. New explicit authorization adds N3 followed by N4, retaining all earlier constraints.

## N3: Weekly service introduction notice

Authorized exact source surface: src/components/EfaEpisodePanel.tsx. Replace the large explanatory introduction with a celeste notice contrasting the indigo CTA, a small accessible close X, and localStorage closedAt scoped to current user in this browser. Hide for seven days after closing; show again on a later section visit after expiry. No 24-hour action and no login counter. Record only the timestamp, never operational data. Validate stored values and fail safely when storage is unavailable; avoid SSR-only/client-only initial markup divergence and account leakage.

Keep Servicios de la guardia heading, current guard state/return CTA, read-only feedback, queue/storage states and operational errors accessible. Explanatory unsent-text and privacy warnings remain reachable through a compact information disclosure when the notice is hidden. This is introductory notice presentation only, not draft/queue persistence behavior.

Route: delegated because reading the existing panel prepares new browser-state/UI logic. Forecast 80–180 source lines, advisory only. Rollback this notice/presentation/state change only. Parent owns tracking and local commits. N3 source must close before N4 source starts; N4 read-only exploration may run independently.

- [x] Source closes explanatory notice with X, seven-day account-scoped local timestamp and malformed/unavailable storage handling.
- [x] Source reevaluates recurrence on section mount/account change; heading, guard access and operational feedback remain accessible.
- [x] Notice background contrasts the indigo CTA; important informational text remains recoverable.
- [x] Static writer/readback and independent review recorded; runtime manual checks pending.

N3 boundary: 9e5318e. Source/static checks only; no tests/build/browser/DB/remotes. RDD off, assessment high/unassessable from unrelated untracked inventory; independent static review found no deterministic blocker. Parent spot-read new account key/state and source count. Timestamp validation accepts only safe positive integer timestamps not in the future, removes only expired notice preference, and handles storage exceptions. SSR/client initial notice is visible; post-mount read and owner guard isolate accounts. Source count: 104 additions/5 deletions, 109 authored lines in EfaEpisodePanel. Local work-unit commit afc9312cdcf4afffa1cecb5c13344acd21ae3e4f, `feat(efa): remember service notice dismissal for seven days`; accumulated N1–N3 authored source count 1132. Human baseline/staged inventory preserved by exact path commit. No publishing. Manual closure/revisit/expiry/storage-disabled checks remain for user.

## N4: Smooth route loading

User requests the app background in RoutePending and a focused higher-layer loader with previous view softly blurred, followed by smooth loader exit/new view entrance. Explore installed TanStack router commit/pending behavior before choosing the simplest compatible mechanism. Preserve authentication/session/cache/SSR, usable controls, reduced-motion preference, redirects/errors, and fast-navigation behavior without artificial load delay. Do not retain old-page snapshots with stale route context or add dependencies.

Exact allowed source surfaces: src/router.tsx, src/routes/__root.tsx, src/components/RoutePending.tsx, src/components/RouteTransition.tsx (new file), src/routes/index.tsx. Source implementation follows N3 closure. Forecast 100–250 lines, advisory only, cached feature-branch-chain strategy and local-only delivery remain. Preexisting human RoutePending copy (Esperee/Cargando) and root error translation must remain in worktree and outside this feature commit. Baseline snapshot/patch: C:/Users/Fernando/AppData/Local/Temp/seliar-routing-baseline-e1192ea8aad848809813a6583bdddaca.

Installed router keeps active matches separate from pending matches. setupPendingTimeout explicitly excludes Infinity, verified by parent source spot readback, so defaultPendingMs Infinity preserves committed view until load readiness without creating an overflowing browser timer. Use a shared root loading controller driven by installed isLoading, short visual display threshold without delaying router work, focused higher-layer translucent existing app background and backdrop blur, and bounded fade exit. New route content may use existing motion-safe entry utilities. Reuse the existing background token; do not recolor the global app gradient or change auth/query/cache/SSR contracts. No old-page snapshot cloning, artificial router minimum delay, or new package.

- [x] Pending source shares app background and focused overlay placement.
- [x] Installed router preserves previous committed matches until readiness; new content and overlay transition without forced router waiting.
- [x] Source handles motion reduction, initial fallback and pending interruption; installed readiness/error/redirect behavior was inspected.
- [x] Human baseline changes preserved; independent source review and parent readback recorded, user runtime checks pending.

N4 boundary: afc9312. No executable checks, browser QA, database or remote work. RDD off; no native lifecycle. Native assessment was high/unassessable from untracked inventory, so independent static review inspected actual source and installed contracts; no deterministic blocker found. Parent read back RouteTransition and installed Infinity guard, then inspected exact cached root/pending diffs excluding human text edits.

Source implementation: new RouteTransition derives actual isLoading and committed match presence, content is inert/busy during real navigation, overlay appears after 120 ms, exit cleanup is 180 ms with pointer interaction released and accessibility hidden during decorative exit. Timers cancel on state changes/unmount; renewed loading reverses an exit. Reduced motion omits animation and exit wait. Overlay uses z100, translucent existing workflow background and backdrop blur; standalone RoutePending uses workflow-background. Public landing entry uses existing motion-safe utilities. QueryClient/SSR/auth/session contracts remain unchanged.

Exact staged source count: 105 additions/7 deletions, 112 authored lines across the five authorized source paths; accumulated N1–N4 count 1244. Local work-unit commit 6da5ffa42ee568b732694f06523ca05814280a9e, `feat(ui): soften route loading over the current view`. Initial reverse of the captured human patch refused because the current loader label differed from the snapshot (Espere... versus Esperee); it made no commit. Preserved the live worktree and constructed only a feature-only indexed RoutePending blob with the original HEAD labels, then excluded root translation through its exact captured patch. Cached and post-commit diffs confirm labels and root translation are excluded. Original staged/dirty inventory remains untouched; a new concurrent EfaGuardPanel dirty change outside N4 surfaces was also left untouched. No publishing. RDD disabled/unmanaged; source review is not runtime approval.

Manual checks pending: close/revisit/expiry and unavailable notice storage; internal navigation fast/slow, errors/redirects, keyboard/inert recovery and reduced motion. Source evidence does not claim runtime verification.

Next step: user manually reviews the completed notice and route transitions. N3/N4 source work is complete. Parent owns this file and full recovery mirror.

## Recovery mirror

Repository-relative locator: odd/tasks/session-aware-navigation.md.
Engram topic: odd/session-aware-navigation/tasks.
