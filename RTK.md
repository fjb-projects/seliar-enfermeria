# RTK - Rust Token Killer (Codex CLI)

**Usage**: Token-optimized CLI proxy for shell commands.

## Rule

Use explicit RTK wrappers for supported executable commands. Use `rtk proxy`
when an executable needs its original output or has no suitable RTK filter.
Native PowerShell cmdlets may run directly; they are not executable commands
that RTK can wrap. Existing safety and verification instructions take priority.

Examples:

```bash
rtk git status
rtk cargo test
rtk npm run build
rtk pytest -q
```

## Meta Commands

```bash
rtk gain            # Token savings analytics
rtk gain --history  # Recent command savings history
rtk proxy <cmd>     # Run raw command without filtering
```

## Verification

```bash
rtk --version
rtk gain
which rtk
```
