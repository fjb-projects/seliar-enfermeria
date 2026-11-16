# Compensatory request and profile email
Branch: `feat/compensatory-manual-bank`; delivery: ask-on-risk; runner: Vitest and TypeScript.
Existing uncommitted prerequisite work must remain intact; no real email, remote access, data migration or deployment authorized.

## Specs
- S1: «cuando el agente carga la solicitud y elije su nombre, también se debe cargar su correo electrónico si existe, sin posibilidad de correjirlo»; public form must not disclose the stored address and server resolves it.
- S2: «si no existe, en el form de solicitud [...] debe ser obligatorio y avisar que a ese correo le llegará la respuesta positiva o negativa de la solicitud»; submission records it without changing the profile.
- S3: «Y luego, en coordinación ponemos : "agregar al perfil"»; explicit authenticated review and action, only while profile has no email, preserving audit and concurrent edits.
- S4: «Si ya tiene correo: no se muestra la dirección completa en el formulario público ni se permite modificarla desde allí; Coordinación podrá revisarla desde la vista autenticada.»
- S5: «El correo nuevo no actualizará la ficha automáticamente. Y, hasta que implementemos el envío, la aplicación no debería dar a entender que ya se envió una respuesta.»

## Tasks
- T1 [S1,S2,S4,S5] delegated — implemented locally, RED/GREEN; 0033 pending isolated PostgreSQL proof and application; no commit.
- T2 [S3,S5] delegated — implemented locally, RED/GREEN and retry correction; user visual QA and live integration pending; no commit.
- T3 [S1–S5] inline + independent verifier — focused/type checks and independent recheck complete; full suite has one pre-existing EFA failure; migration, real DB proof, visual QA and coherent commits pending.

## Log
- L1 User: «Vamos a resolver ahora esto: En compensatorio, cuando el agente carga la solicitud y elije su nombre, también se debe cargar su correo electrónico si existe, sin posibilidad de correjirlo, y si en la db no hay email, ahí si se habilita para agregar el correo. No sé que puede ser mejor si que en la solicitud se agregue ese completado en la db del perfil del agente, o que desde coordinación se agregue una flag avisando que se puede guardar y este el disquete al lado del mail para guardarlo en la db. Analicemoslo antes de avanzar».
- L2 User: «Sería bueno que entonces dejemos el espacio en blanco si no existe, en el form de solicitud, dy deebe ser obligatorio y avisar que a ese correo le llegará la respuesta positiva o negativa de la solicitud. Y luego, en coordinación ponemos : "agregar al perfil"»; user: «Si está bien asi»; user: «Avancemos».
- L3 Read-only exploration found current public request stores a separate email snapshot; existing public form never authenticates the selected name, and staff profile update has optimistic version and audit. Do not expose stored email or treat an unverified request email as identity proof.
- L4 Parallel writer reason: public intake and authenticated coordination are independent units with disjoint edit surfaces; parent owns integration and git. Forecast exceeds 400 authored lines; no commit until coherent prerequisite work can be separated safely from existing dirty tree.
- L5 Public list exposes only email-existence metadata; submitted profile email is resolved under row lock on server. Explicit promotion requires active administrator, confirmation, row lock, expected version and empty profile email; records staff audit, without asserting identity was verified or sending email. Concurrent and uncertain retries require frozen operation identity.
- L6 Corrected public idempotency by storing normalized client payload hash in additive nullable 0033 column; no backfill. Legacy requests compare persisted payload exactly. Independent recheck's hashless-legacy/blank-email concern describes a state the prior public implementation could not create: earlier endpoint required nonblank valid email. No migration applied or real data/remote access.
- L7 Parent focused four suites 24/24 and typecheck pass; independent recheck passed focused tests and verified retry correction. Full suite scratch 931/932, sole known EFA copy mismatch. The suite runner retained two OS-temp scratch copies because cleanup was blocked by host policy; they include copied docs and must be treated as potentially sensitive.
- L8 Pending: separately authorized isolated PostgreSQL migration/service proof, user visual QA, and separately authorized local migration after backup. Integration deploy, real emails, profile modifications and commits remain unperformed. RDD clone-local off; assess unable to classify untracked inventory and reported high.
- L9 User reports applying migration 0033 manually; no independent database readback or isolated PostgreSQL proof was performed. User QA identified the disabled email field as confusing and requested a visible message instead. Replaced the disabled field with a normal-sized message and a direction to contact Coordinación; no part of the saved address is displayed publicly. Empty profiles retain the required input.
