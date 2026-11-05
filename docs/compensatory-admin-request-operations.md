# Register an administrative contingency request

Historical source reconciliation and the public form remain the normal intake paths. The authenticated administrative form is a fallback for a request received through another channel; it is not a bank movement or a bulk importer.

## Quick path

1. Open Coordination → Compensatory hours → **Pendientes**, then **Cargar solicitud**. A selected active agent is preselected; in general scope choose an active agent.
2. Enter the contact email, mobile unit, today-or-future date, hours/minutes and reason for administrative entry.
3. Review and confirm. A possible duplicate requires explicit additional confirmation before any new request is written.

The request enters decision-pending state with the authenticated administrator recorded in its classification audit. Creation does not approve the request, reserve hours, debit the bank, verify the mailbox or send email. Contact information is a snapshot for the request, not a silent update of the agent's profile.

## Retry and duplicate review

An uncertain response keeps the same operation and draft. Do not start a separate request to retry; use the existing retry action. Editing a draft after a duplicate warning clears its confirmation. A confirmed creation remains confirmed even if refreshing the request list fails.

The duplicate warning checks matching agent/date/minutes across persisted request states; it cannot establish that all unreconciled historical source strings represent distinct requests. Continue reconciling imports before operational launch.

## Verification boundaries

Focused service/adapter/UI tests, typecheck, build and synthetic browser checks passed. The full suite reports 898/899 tests, with the unchanged EFA empty-history wording mismatch. No new schema migration is required. Ten real-PostgreSQL cases passed in a unique synthetic schema using the actual adapter/service, including rollback, duplicates, authorization and concurrency; the schema was removed afterward. This is not a full production-schema replay. The user reported manual QA acceptance. No real requests were imported or created during implementation or verification.
