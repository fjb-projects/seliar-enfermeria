# Codex tooling readiness

## Objective

Use Gentle AI, Engram and RTK before implementing the approved EFA mobile UX changes.

## Authorization and scope

The user requested that unused tooling be diagnosed and resolved before UI implementation. Local dependency installation and project RTK instructions are in scope. UI implementation remains conditional on verified tooling readiness. No remote execution, publishing, database access, hook trust changes or native review enablement is authorized.

## Evidence

- Gentle AI 4.0.0 is available; its delegation/task conventions are used. Native review is off by the clone-local preference.
- Engram 3.0.0 is enabled. Its two executable paths have identical SHA256 hashes.
- The runtime has not handed off a registered session identity after compaction. Agent-attributed memory tools remain prohibited.
- The tested Git Bash hook transport initially could not resolve jq. Engram project parsing and identity validation require jq.
- RTK 0.48.0 is installed. `rtk git status --short` succeeded with the expected warning that no global hook is installed.
- WinGet installed verified official `jqlang.jq` 1.8.2 per-user; its installer hash verified. The package-managed executable printed `jq-1.8.2`.
- Git Bash (`--noprofile --norc`) resolved jq after rebuilding only this command process PATH from persisted User/Machine PATH plus inherited context. It printed `jq-1.8.2`, and synthetic JSON validation returned `true`; no hook ran. The WinGet `Links\jq.exe` alias was absent; the persisted User PATH included the package-managed directory, while the prior process PATH did not. WinGet reported a shell restart is required for PATH changes to reach inherited shells.
- `rtk init --codex` created RTK.md and appended `@RTK.md` to AGENTS.md. The prior AGENTS content remains unchanged; a concise instruction follows the reference telling Codex to read RTK.md before supported shell commands and use its RTK wrappers.

## Constraints

- Never invent, select or register a runtime identity, run the registration hook manually, or substitute manual memory saves.
- Restore jq through the verified WinGet package jqlang.jq, using the package-manager-managed per-user installation.
- Preserve existing AGENTS.md content and all unrelated repository changes.
- Use explicit RTK wrappers for supported commands; do not install a Claude hook or rewrite every command blindly.
- Host startup/resume must register the same runtime session before memory operations resume.
- Engram mirror is pending because the host identity is unavailable; this file is the recovery record.

## Tasks

| ID | Outcome | Route | Status | Checks |
| --- | --- | --- | --- | --- |
| T1 | Restore jq availability for Git Bash | Delegated; installation and environment verification | Complete: 91ddd86 | WinGet verified the official 1.8.2 package hash and installed per-user; managed binary and Git Bash printed `jq-1.8.2`; synthetic JSON returned `true`; no hook executed |
| T2 | Install local RTK instructions for Codex | Delegated; two instruction files and structural readback | Complete: 09db659 | `rtk init --codex` generated RTK.md; the original AGENTS content was preserved and the RTK reference plus explicit wrapper instruction were appended; `rtk git status --short` succeeded |
| T3 | Verify host registration and Engram readiness | Host-owned registration, then agent verification only after authoritative handoff | Blocked on host | Same-session authoritative successful handoff; no invented identity or agent registration |

## Verification policy

No meaningful application RED test applies to this dependency/instruction repair. Verify the installed dependency and instructions directly. Source UI, package manifests and application test files remain unchanged. An independent worker checks final availability and instruction preservation. Native review remains off.

## Delivery

Independent final verification passed: Git Bash resolved jq 1.8.2 and parsed synthetic JSON through the persisted-path environment; RTK status and diff checks passed; the original AGENTS content was preserved. RTK instructions distinguish supported executables, raw proxy commands and native PowerShell cmdlets. Native review remains clone-local off. Risk assessment was unassessable because unrelated untracked inventory requires declaration; independent verification covered the high/unassessable tier. No registration or memory operation was attempted.

- Local branch: codex/tooling-readiness, based on 9c8efbe.
- Strategy: feature-branch-chain; forecast below 400 authored lines.
- Commit each verified work unit locally with a Conventional Commit message. No push or PR.
- T1 commit: 91ddd86, 57 authored lines; dependency repair and independent verification recorded.
- T2 commit: 09db659, 42 authored lines; local RTK instructions and independent verification recorded. Total T1/T2: 99 authored lines, excluding administrative closure.

## Progress

T1 and T2 are verified locally. The current app process initially had stale PATH; Git Bash verification succeeded after a process-local rebuild from persisted User/Machine paths plus inherited context. A fresh shell/host startup is required to inherit WinGet PATH changes. T3 remains blocked until the host starts/resumes this same conversation and provides its authoritative registered session handoff.

## Next step

Request host startup/resume for the same conversation to establish the authoritative registered session handoff for T3. Do not execute a hook or use a memory tool until that handoff exists, and do not implement the EFA UX changes until Engram readiness is confirmed.
