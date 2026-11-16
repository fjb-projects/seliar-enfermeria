# Compensatory request lifecycle operations

The lifecycle service preserves imported request fields as evidence, requires an administrator to classify a request explicitly, reserves approved hours, and writes one attributable system ledger entry when the effective service day arrives.

## Quick path

1. Apply the additive migration through the repository's normal reviewed migration workflow; this runner never applies migrations.
2. Set `DATABASE_URL` explicitly in the process environment. The runner accepts loopback PostgreSQL only and does not load `.env` files.
3. Run `node scripts/compensatory-settlements.mjs once` for one catch-up pass, or `node scripts/compensatory-settlements.mjs watch` for minute-aligned polling.
4. Inspect request audit and ledger rows after each pass. Re-running a pass does not consume a request twice.

## Request and balance rules

| Operation | Rule |
|---|---|
| Import | New and existing request source strings remain unchanged; records begin `unclassified`. |
| Classification | An active administrator confirms a canonical today-or-future date and integer minutes. |
| Approval | Only pending requests can be approved; available balance must cover the full request. Future approvals reserve balance without a debit. |
| Same-day approval | The decision and system consumption ledger entry are atomic; one operation cannot consume twice. |
| Rejection or cancellation | Rejection creates no reservation. Future approved requests can be cancelled before their effective day, which releases the reservation without credit. |
| Due processing | `once` and `watch` catch up every approved request whose effective day is due. Failed passes exit nonzero; correct the underlying issue and rerun safely. |
| Manual balance edits | Debits and credit reversals preserve every still-approved reservation, including overdue requests not yet consumed. |

## Workspace flow

1. Use **Historial** to find imported evidence marked **Sin resolución registrada**. Confirm its date, hours, minutes and reason before **Enviar a pendientes**. This does not approve the request.
2. In **Pendientes**, open **Revisar**, choose approval or rejection and provide a reason. The interface does not preselect a decision.
3. Future approvals appear in **Programados** and reserve the existing available balance. Same-day approvals consume immediately. Imports do not credit the bank.
4. A future approval can be cancelled before its effective service day; the reservation is released without adding a second credit. After the cutoff use authorized audited ledger corrections, not ordinary cancellation.
5. Select an agent to see accounting balance, reserved and available hours. **Registrar horas** opens the existing opening/credit/debit form. **Herramientas** retains the CSV/JSON workflow, profile administration and guarded deletion.

The local `watch` process is not installed as an operating-system startup service. After a machine restart or process termination it must be restarted by the operator or an explicitly configured supervisor. Avoid starting extra copies unnecessarily; settlement itself remains idempotent.

`watch` is a process, not a production host registration. No production scheduler, credentials, endpoint, or deployment configuration is created here. Operators should run the service under their approved host process manager only after a separately authorized deployment plan.
