# Navigation feedback and safe session errors

Add visible route-loading feedback consistent with the existing application, then correct the verified handling of session-read failures. The reported database SELECT failure has no confirmed underlying cause; diagnostic containment is not a claimed Neon repair.

## Authorized scope

- User requested a spinner between views/access navigation and resolution of the console error after panel → guardia-efa.
- Shared accessible pending view, actual navigation state, no new dependencies or fake progress. Match existing colors and mobile-first spacing; UI copy follows professional Spanish already used by the app.
- Reduce duplicate session reads within one request while preserving fresh database authorization on every server action. A missing/inactive session may redirect; infrastructure errors must not masquerade as logout.
- Auth diagnostics must retain only allowlisted error class/code, timestamp and phase. Never log session tokens, SQL/parameters, credentials, headers, raw messages/stacks or connection values. Do not copy the user's token to fixtures or artifacts.
- No remote access, environment-file reading, real DB connection, migration, session reuse/revocation, deployment or publication. No speculative driver/pool tuning or automatic retries of authentication/mutations.
- Preserve public forms, existing uncommitted files and intentional staged bootstrap untracking. RDD is explicitly OFF for this clone; no native review or switch changes.

## Delivery and recovery

- Branch: `codex/navigation-feedback-and-auth-errors`, based on `6537322`.
- Forecast: approximately 350–650 authored changed lines; proportional behavior/test work units, not a hard cap. Reuse the agreed `feature-branch-chain` strategy if the feature exceeds the advisory budget. No remote PR creation is authorized.
- Local recovery document: `odd/tasks/navigation-feedback-and-auth-errors.md`. Engram mirror `odd/navigation-feedback-and-auth-errors/tasks` is pending: the host has not registered an authoritative session identity. No memory tools or substitute CLI saves are allowed.

## Tasks

- [x] **N1 — Shared route-pending feedback.** Delegated route: router configuration, reusable pending component and deterministic tests require preparation and multiple nontrivial files. Bind an accessible default pending component at the router level, with `defaultPendingMs` and `defaultPendingMinMs` both zero so real async route loading appears without an artificial delay or minimum duration. Accessible status text, decorative Lucide spinner, reduced-motion fallback, mobile layout. Test the actual router pending binding and deferred loader state where the node-only Vitest setup permits; fast transitions get no fake progress. RED before implementation where runnable.
- [ ] **A1 — Safe session failure handling.** Delegated route: auth configuration/functions, route handling and tests. Verify installed Better Auth error-hook typing before using it. Sanitize nested/cyclic errors without raw details; public thrown error must not retain a secret-bearing cause. Preserve unauthenticated/inactive behavior and fresh server authorization. Test one session fetch for readSession and failure → retryable boundary rather than login redirect. The DB root cause stays pending until safe real error metadata is observed.

## Applicable checks

- Writer observes meaningful Vitest RED → GREEN for behavior, then normalizes changed files before final checks.
- Each unit: focused Vitest tests, full `npm.cmd run test`, `npm.cmd run typecheck`, `npm.cmd run build`, scoped ESLint/Prettier and `git diff --check`.
- Independent verifier checks actual production bindings and security/authorization boundaries; parent reruns one reported command and reads one structural spot check.
- Local Conventional Commits keep behavior, tests and this document together; no AI attribution. Stage exact feature paths only.
- Fakes/SSR do not certify mobile browser rendering, real cookies, real DB recovery or session revocation. Real Neon failure reproduction remains unverified without an explicitly authorized environment.

## Evidence and progress

- Read-only exploration verified router has no shared pending component, readSession queries getSession twice, guard route reads session again in loader, and panel/guard route catch session-read failures and redirect to login.
- Installed Better Auth has an onAPIError.onError path before default internal-error logging; existing global error capture can expand stack/cause and root boundary can forward errors. Auth errors must therefore be sanitized at their origin, not merely hidden in UI.
- No evidence supports changing Neon Pool defaults or retrying failed operations. No tests run for this feature yet.
- N1 implementation is local and awaiting parent independent closure: `RoutePending` provides Spanish `role=status` feedback, a decorative Lucide spinner with a reduced-motion fallback, and mobile-friendly layout. `getRouter()` binds it as TanStack's default pending component with zero pending delay and zero minimum display time. A deferred-loader router test observes `isLoading` during a real router transition in Vitest; SSR verifies the component's accessible markup.
- N1 test-first evidence: the focused tests initially failed because `RoutePending` did not exist. After implementation, `npm.cmd run test -- src/components/RoutePending.test.tsx src/router.test.tsx` passed 3/3; the full `npm.cmd run test` passed 235/235; `npm.cmd run typecheck`, `npm.cmd run build`, scoped ESLint/Prettier, and `git diff --check` passed. Build reports existing `vite-tsconfig-paths` and legacy `inputValidator` warnings. A test-only synthetic path required a cast because generated route registration narrows valid application routes; the production router remains strongly typed.
- N1 limits: Vitest confirms the router loading state and configured component, but node-only SSR does not prove browser rendering, visual layout, or assistive-technology behavior. No dependencies, auth changes, environment access, or DB operations were made. N1 remains unchecked until parent independent closure; A1 is untouched.

## Next step

Next: parent independently verifies and commits N1; then implement A1. Report diagnostic limits honestly and request only sanitized metadata if the database error persists.

- N1 independent closure: PASS, focused 3/3; installed TanStack client boundary binds default pending rendering for async beforeLoad/loaders with zero delay and minimum hold. Parent focused spot check 3/3 and router/component structural readback passed. Browser visibility and assistive technology remain unverified. Rollback is limited to shared pending component/configuration/tests; auth and public-form behavior are unchanged.
