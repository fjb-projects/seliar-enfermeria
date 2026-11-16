# Manage hours and inspect agent history

In Coordination → Compensatory hours, select an agent before recording hours. The workspace uses one **Gestionar horas** action and keeps history outside the entry dialog.

## Record hours

1. Choose **Liquidación por período** for annual 2024/2025 net balances or a monthly liquidation for the current year. Use **Ajuste manual** only for a documented opening, credit or debit that is not already represented by a period.
2. Fill in the applicable fields and reason, then choose **Revisar**.
3. Check the period or adjustment, net result, actual bank impact, accounting balance, reservations and available balance before **Confirmar registro**.

System-recorded consumption is included in the period's displayed net but is not deducted again. A manual adjustment and a period are different operations: the operator must not record the same source hours in both modes. The server remains authoritative for balances and reservations.

If the response is uncertain, keep the dialog open and retry the same operation. Controls remain locked to prevent changing its intent. A confirmed operation stays confirmed even if refreshing the workspace fails.

## Inspect and correct history

Open the main **Historial** tab with the agent selected. Filter by year and record type. Period-linked ledger entries are consolidated into the period row; requests are informational and do not add another balance effect. Expand the secondary details for audit information or reopen a request for its existing administrative workflow.

**Descargar CSV filtrado** exports the current filters. The extract distinguishes period net from actual bank impact; text fields are CSV-escaped and protected against spreadsheet formula execution.

Corrections append audited reversals rather than deleting records. Period reversals use their dedicated endpoint; eligible manual movements use the manual reversal workflow. Request consumption cannot be reversed through those generic manual controls.

## Verification boundaries

UI checks use synthetic APIs and compiled production styles at desktop and 390-pixel phone widths. They do not submit real staff movements, import CSV data, or send resolution email. This UX refactor requires no new migration and does not change accounting or authorization rules.
