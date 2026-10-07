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

- [x] **N1 — Shared route-pending feedback.** Delegated route: router configuration, reusable pending component and deterministic tests require preparation and multiple nontrivial files. Bind an accessible default pending component at the router level, with `defaultPendingMs` and `defaultPendingMinMs` both zero so real async route loading appears without an artificial delay or minimum duration. Accessible status text, decorative Lucide spinner, reduced-motion fallback, mobile layout. Test the actual router pending binding and deferred loader state where the node-only Vitest setup permits; fast transitions get no fake progress. RED before implementation where runnable. Committed as `e568dc5135318a31d536428c4a1592c71f44719f`; parent recorded independent PASS.
- [x] **A1 — Safe session failure handling.** Delegated route: auth configuration/functions, route handling and tests. Verify installed Better Auth error-hook typing before using it. Sanitize nested/cyclic errors without raw details; public thrown error must not retain a secret-bearing cause. Preserve unauthenticated/inactive behavior and fresh server authorization. Test one session fetch for readSession and failure → retryable boundary rather than login redirect. The DB root cause stays pending until safe real error metadata is observed.

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
- N1 `RoutePending` provides Spanish `role=status` feedback, a decorative Lucide spinner with a reduced-motion fallback, and mobile-friendly layout. `getRouter()` binds it as TanStack's default pending component with zero pending delay and zero minimum display time. A deferred-loader router test observes `isLoading` during a real router transition in Vitest; SSR verifies the component's accessible markup.
- N1 test-first evidence: the focused tests initially failed because `RoutePending` did not exist. After implementation, `npm.cmd run test -- src/components/RoutePending.test.tsx src/router.test.tsx` passed 3/3; the full `npm.cmd run test` passed 235/235; `npm.cmd run typecheck`, `npm.cmd run build`, scoped ESLint/Prettier, and `git diff --check` passed. Build reports existing `vite-tsconfig-paths` and legacy `inputValidator` warnings. A test-only synthetic path required a cast because generated route registration narrows valid application routes; the production router remains strongly typed.
- N1 limits: Vitest confirms the router loading state and configured component, but node-only SSR does not prove browser rendering, visual layout, or assistive-technology behavior. No dependencies, auth changes, environment access, or DB operations were made. Parent independent closure passed; browser visibility and assistive technology remain unverified.

## Next step

Next: complete A1, then parent independently verifies the combined feature slice. Report diagnostic limits honestly and request only sanitized metadata if the database error persists.

- N1 independent closure: PASS, focused 3/3; installed TanStack client boundary binds default pending rendering for async beforeLoad/loaders with zero delay and minimum hold. Parent focused spot check 3/3 and router/component structural readback passed. Browser visibility and assistive technology remain unverified. Rollback is limited to shared pending component/configuration/tests; auth and public-form behavior are unchanged.
- A1 implementation: Better Auth 1.7.7 exposes `onAPIError.onError(error: unknown, ctx)` and runtime `api/index.mjs` routes errors there before default raw-error logging; its installed logger type permits a custom `log(level, message, ...args)` callback. The configured hook and logger now send only timestamp, bounded phase, safe error class, and allowlisted code. `readSessionSnapshot` invokes the session provider once, then loads fresh account roles; missing, expired, or inactive sessions still return null, while provider/database exceptions become cause-free retryable errors. The guard loader uses the session resolved in beforeLoad; server list methods remain separate authorization checks. RED observed: the configuration test failed because the hook was absent and the session helper modules did not exist. Focused auth tests pass 13/13; full `npm.cmd run test` passes 245/245; `npm.cmd run typecheck`, `npm.cmd run build`, scoped ESLint, Prettier check, and `git diff --check` pass. Build retains the existing Vite path-resolution and deprecated-validator warnings. No DB root cause was observed or claimed; A1 awaits parent independent verification.
- A1 correction after independent verification: returning the access lookup promise without `await` let its later database rejection bypass `currentAccessSession`'s `try/catch`. A regression invoking the actual binding with a rejected access query failed RED by exposing synthetic SQL/password text; `return await` now routes it through the safe diagnostic and cause-free retry error. The regression passes GREEN, and all required checks have been rerun successfully.

- A1 independent closure: PASS after the actual exported currentAccessSession regression; focused 13/13. Parent spot check auth diagnostics/session/functions 9/9 and actual route-retry/error bindings passed. No original Neon root cause or real connection recovery is certified.
- A later external/unattributed RoutePending copy edit changed the visible/accessibility strings. It is preserved and excluded from feature staging. The literal-copy test failed once (1 failed, 2 passed); the parent made only the test assertion resilient to nonempty visible/status copy, preserving accessibility and reduced-motion checks. Focused loader tests passed again 3/3. Final combined verification follows; no source text was reverted.
- Walkthrough requested by the user: episode creation persists a server draft only on Guardar borrador; unsent form fields and locally pending operations are distinct. The current episode state remains draft and has no episode-finalization button. Calls and dispatches close independently. No walkthrough UI changes are authorized.

## Final local outcome

- N1 committed as e568dc5135318a31d536428c4a1592c71f44719f (143 authored additions). A1 and its regression corrections are independently verified and ready for selective commit. This section supersedes earlier pending states.
- Final combined suite: 42 files, 245/245 tests, exit 0. Typecheck, build, scoped ESLint/Prettier and diff-check passed. Parent auth spot check passed 9/9; loader spot check passed 3/3. A late tone-only public-message change caused one stale exact assertion (244/245); its expected copy was synchronized and the final full suite passed. No authentication semantics changed in that correction.
- A1 closes verified error containment and query amplification, NOT the underlying Neon outage. If it recurs, inspect only the sanitized Authentication operation failed line with timestamp, phase and optional allowlisted code; do not share SQL, parameters, cookies or tokens. No automatic retry, driver change, migration or real DB recovery proof was performed.
- Rollback boundary: auth-safe diagnostics/session read normalization and panel/guard retry boundaries plus their tests; retain database models, EFA server authorization and public forms. The external/unattributed pending-spinner copy edit stays uncommitted and untouched.
- RDD remains OFF; no native approval, publication or remote operation. Engram mirror remains pending due to missing runtime identity. Browser rendering, assistive technology, cookies and real Neon reproduction are unverified.
- Next: user restarts the development server and checks panel → guardia-efa, then follows the episode walkthrough; if the database failure persists, its sanitized code is the next diagnostic evidence.

- Delivery record: A1 committed as 5ff15d5b18063eaa4fea3c02a12d11ca72ef37ce (415 additions, 36 deletions; 451 authored changed lines). Running behavior-unit count is 594, with N1 and A1 as coherent feature-branch-chain slices; no PR was created. User changes remain outside these commits.
