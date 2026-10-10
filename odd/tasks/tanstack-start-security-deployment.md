# Align TanStack Start Packages for Vercel Deployment

## Objective

Resolve the Vercel security block for TanStack Start without leaving an incompatible Router package set, then produce a successful production build.

## Problem and Why

Vercel rejected the deployment because `@tanstack/react-start@1.168.32` was below the security patch. Updating only React Start to `1.168.60` left Router and its Vite plugin at older direct versions, and the local build then failed on missing exports.

## Scope and Constraints

- Update the compatible TanStack package set in `package.json` and its npm resolution in `package-lock.json`.
- Preserve Vercel deployment settings and unrelated working-tree state.
- Do not use the vulnerable-deployment override.
- Run the requested install and production build. Do not run tests.
- Do not push or deploy remotely.

## Allowed Edit Surfaces

- `package.json`
- `package-lock.json`
- `node_modules/**`

## Acceptance Criteria and Checks

- [x] `@tanstack/react-start` resolves to `1.168.60` or later (`1.168.60`).
- [x] TanStack Router packages resolve as a compatible release set: React Router `1.170.41`, router-plugin `1.168.42`, router-core `1.171.34`, and start-server-core `1.169.39`.
- [x] `npm run build` succeeds (client, SSR, and Nitro production builds; Vercel output generated).
- Tests: not run, per user preference.
- Manual Vercel redeployment: pending user push to `main`.

## Tasks

- [x] **TAN-1 — Align TanStack direct dependencies.** Use the patch cohort `@tanstack/react-start@1.168.60`, `@tanstack/react-router@1.170.41`, and `@tanstack/router-plugin@1.168.42`; update npm lock resolution. Route: delegated direct, because two non-trivial dependency files change. Trigger: multi-file dependency update and user-authorized install.
- [x] **TAN-2 — Verify dependency tree and production build.** Confirm patched Start and Router versions, then run `npm run build`. Route: delegated verification. No tests requested.

## Progress and Evidence

- Starting state: feature branch `codex/efa-ui-mobile-integrator`; only `package.json` and `package-lock.json` modified for the preceding React Start security upgrade.
- Verification evidence: `npm install @tanstack/react-start@1.168.60 @tanstack/react-router@1.170.41 @tanstack/router-plugin@1.168.42` succeeded; lockfile resolves Start `1.168.60`, Router `1.170.41`, plugin `1.168.42`, router-core `1.171.34`, and start-server-core `1.169.39`. `npm run build` succeeded once. No tests run, per user preference. npm reported 3 audit vulnerabilities (2 high, 1 critical); package identities were not included in the install summary and no audit fix was run. Build emitted non-blocking route-export, deprecated `inputValidator()`, Vite migration, large chunk, and Windows native-module portability warnings.
- Independent verification: no manifest/lock mismatch; all 50 exact TanStack dependency edges resolve to declared versions. The successful build was accepted from the delegated command result and not rerun independently; it verifies local compilation, not Vercel runtime behavior. Node requirement for Start is `>=22.12.0`; Vercel's selected Node version remains unverified.
- Focused test: N/A, per user preference. Runtime/build command: `npm run build` — exit 0.
- Rollback boundary: revert only `package.json`, `package-lock.json`, and this task record to remove this dependency repair.
- Commit: pending.
- Delivery strategy: `ask-on-risk`; no push or PR requested in this task.

## Next Step

Record the work-unit commit, then report whether the updated build is ready for the user to push to `main`.
