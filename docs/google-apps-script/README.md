# Google Apps Script bridges

Each SeLIAR workflow has an isolated Apps Script deployment and Google Form contract.
Keep bridge files flat in this directory: use names such as `cambioGuardia.gs`,
`compensatorio.gs`, and `lao.gs`; do not create one folder per workflow.

## Cambio de guardia

1. Create a standalone Apps Script project and paste `cambioGuardia.gs`.
2. In **Project Settings → Script properties**, add `CAMBIO_GUARDIA_SECRET` with a
   strong secret value.
3. Deploy it as a web app that accepts POST requests from the SeLIAR server.
4. Configure the application server with:
   - `GOOGLE_APPS_SCRIPT_CAMBIO_GUARDIA_URL`
   - `GOOGLE_APPS_SCRIPT_CAMBIO_GUARDIA_SECRET`

The browser sends the request only to the TanStack server function. That function
adds the secret server-side before calling Apps Script, so neither Apps Script secret
is exposed to browser code.

Cambio sends a required `requesterEmail` field and a validated `emailRequested` boolean.
The bridge stores the address in the explicit required Google Form item `1891793506`.
It sends an email copy with `MailApp` only when `emailRequested` is `true`, and only
after the Form response is saved. Google Forms automatic email collection may remain
enabled. Authorize `MailApp` when deploying or running the bridge. If email was
requested but delivery fails, the saved Form response still succeeds and the browser
shows a warning; when email was not requested, no delivery warning is shown.

## Existing Control de guardia deployment

Control remains independent. Do not rename or reuse its existing
`GOOGLE_APPS_SCRIPT_URL` and `GOOGLE_APPS_SCRIPT_SECRET` variables for Cambio.
Its bridge continues to be `Code.gs`.
The user can opt in to a copy with the final-send checkbox. The server validates the
choice and passes it separately from the unchanged Form registration payload; `Code.gs`
calls `MailApp` only when the choice is true and only after the Form response is saved.
An email failure does not undo the saved response.

## Compensatorio

1. Create a separate standalone Apps Script project and paste `compensatorio.gs`.
2. In **Project Settings → Script properties**, add `COMPENSATORIO_SECRET` with a
   strong secret value.
3. Automatic Google Forms email collection must be **OFF** for this bridge. The
   bridge submits `FormResponse` objects programmatically and cannot populate
   Google's respondent-email metadata. The Form currently contains the required
   explicit text item `Correo electrónico` (item ID `1851963092`). Run
   `setupCompensatorioEmailField()` from the Apps Script editor; the helper disables
   automatic collection, keeps the explicit item required, and logs its actual ID.
4. Deploy the project as an independent web app that accepts POST requests from the
   SeLIAR server. Authorize `MailApp` when prompted, then redeploy the updated script.
5. Configure the application server with:
   - `GOOGLE_APPS_SCRIPT_COMPENSATORIO_URL`
   - `GOOGLE_APPS_SCRIPT_COMPENSATORIO_SECRET`

The bridge resolves `Correo electrónico` by title at submission time and keeps the
refreshed ID `1851963092` in its known Form contract. It sends the optional copy only
when the validated `emailRequested` request value is true, after saving the response.
If automatic collection is
still enabled, the bridge stops before submission with an operator-facing error;
it never mutates the production Form settings per request. Refresh
`docs/google-apps-script/datosForm.json` if the Form schema changes again. The Form
response is saved before the MailApp copy is sent; if email delivery fails, the
saved request still succeeds and the browser shows a warning.

### Manual private JSON export

`exportCompensatorioResponsesToJson()` is a **manual operator action intended for
the Apps Script editor**, not a new `doGet` or `doPost` endpoint. Preparing this code does not deploy it or
authorize access to production responses.

1. Obtain authorization for the specific Form, executing account, and export.
2. Save the updated `compensatorio.gs` in its existing Apps Script project. Do not
   run setup helpers, change the Form, or replace the existing web-app deployment
   merely to export responses.
3. Select **exportCompensatorioResponsesToJson** in the editor and run it manually.
   Review the requested Forms and Drive permissions before authorizing execution.
   Apps Script may detect the additional Drive scope from the saved source; verify
   authorization/deployment effects with the owner before changing production code.
4. The function creates a **new empty JSON file in the executing user's My Drive**,
   makes it private, checks sharing, and only then writes response data. It logs
   a private file URL, response count, and count of records needing mapping review.
5. Download the JSON privately. Do not make the file public, commit it, paste its
   contents into logs, or treat possession of its URL as permission to share it.

Every run creates a new snapshot; it does not edit/delete responses, send mail,
approve requests, change balances, or import into the application database.
`doGet` remains a health check and `doPost` retains its existing submission behavior.

The version-1 JSON contains `schemaVersion`, `exportedAt`, `source` (Form ID and
script timezone), `responseCount`, and `responses`. Each record contains:

- `responseId` and UTC `submittedAt`, to preserve source identity and submission time;
- `answers`: entries with `field`, original `itemId`, `itemType`, and `value` for
  name, explicit email, mobile, requested date, and hours;
- `missingFields`, `duplicateFields`, and `unmappedItemIds`, for import reconciliation.

Answer strings remain unchanged: `12,5` is not rounded, and an ambiguous date
such as `10/11/2026` is not guessed. Native Date values, if returned, are encoded
as `{ "kind": "date", "iso": "..." }`; arrays retain their structure. The future
importer must validate values and timezone semantics, not assume all records are valid.
Blank legacy values and duplicate mapped answers are retained. Unknown question
values are excluded to minimize data exposure; their item IDs are reported for
mapping review. The explicit email question is resolved by its known ID or title,
not by respondent-email metadata. No edit-response links or secrets are exported.

Missing response identity, invalid timestamps, unsupported value types, or a
snapshot over 10 MB stop the export before file creation; no rows are silently
truncated. A larger dataset requires a separately reviewed batch exporter.
If sharing or writing fails, only the newly created file is moved to trash. If
cleanup also fails, the function reports that manual inspection is required.
Do not trust or share an incomplete file. Original Form responses remain intact.

This is a snapshot, not continuous synchronization. The later importer must
deduplicate by source Form + response ID, reconcile mapping issues, and apply the
agreed historical/pending cutoff without inferring approval or debiting hours.

Local verification uses simulated Google services and fictitious data:

```sh
npm test -- src/lib/compensatorio-export.test.ts
```

## Ingreso

This flow uses a separate Apps Script project and Form. No deployment URL, Form ID, or
secret is checked into the repository.

1. Create a standalone Apps Script project and paste `ingreso.gs`.
2. For a new installation only, run `setupIngresoForm()` once from the Apps Script
   editor. It creates a dedicated Form, stores its generated ID in the
   `INGRESO_FORM_ID` script property, and logs the edit URL. It refuses to create a
   second Form while that property is set. If the Form already exists, do not run setup
   again; use the migration steps below.
3. In **Project Settings → Script properties**, set `INGRESO_SECRET` to a strong secret.
   Keep both script properties private.
4. Review the generated Form fields and mobile choices. The Form's automatic email
   collection is disabled; it includes an explicit required email field.
5. Deploy the project as a web app that accepts POST requests from the SeLIAR server.
   Authorize `MailApp` when prompted, then configure the hosting environment with:
   - `GOOGLE_APPS_SCRIPT_INGRESO_URL`
   - `GOOGLE_APPS_SCRIPT_INGRESO_SECRET` (the same value as `INGRESO_SECRET`)

The browser sends submissions only to the TanStack server function, which validates
the payload and adds the secret server-side. The bridge validates the name, email,
mobile, coordinates, location accuracy, and location-capture timestamp before saving
the Form response. It keeps the raw UTC capture timestamp and adds a deterministic
`dd/MM/yyyy HH:mm:ss` value in `America/Argentina/Buenos_Aires`. Google Forms supplies
a separate response-submission timestamp. Latitude, longitude, and reported accuracy
remain separate text fields. The bridge also stores a `Ubicación en Google Maps` text
answer containing a Maps URL built from the validated coordinates; no API key is
required. These two machine-populated fields are optional in Google Forms so the
previous deployed handler can keep accepting submissions while the Form is migrated;
the current handler always supplies them. A one-time location capture is required
before the browser enables submission; the app does not track location continuously or
treat GPS as identity verification. The current route remains intentionally unlinked
from Home and the mobile navigation while it is being previewed.

### Existing Form migration

For the already-created Ingreso Form, follow this order to avoid rejecting submissions
during rollout:

1. Save the current `ingreso.gs` source in the standalone Apps Script project.
2. Before deploying it, run `migrateIngresoFormLocationFields()` from the Apps Script
   editor under the account that owns the Form. The helper uses the existing
   `INGRESO_FORM_ID`, adds only missing optional short-text items `Fecha y hora de
   captura (Argentina)` and `Ubicación en Google Maps`, and ensures those two target
   items are optional. It does not create a Form or change unrelated fields. It is
   idempotent; duplicate exact titles or wrong item types fail before migration edits.
3. Immediately deploy a new web-app version with the updated handler.
4. Confirm both questions appear and submit a test check-in.

Between steps 2 and 3, the old deployed handler continues accepting check-ins because
the new questions are optional. Responses submitted in that interval will have blank
values for the two new fields. Schedule the migration at low volume; pause intake if
complete timestamp/Maps reporting is required for every response. After the new version
is deployed, the current handler always fills both fields. The Maps answer is a URL the
manager can copy/open; the Argentina time represents GPS capture, not the later Form
submission. A map pin reflects device-reported coordinates and does not prove identity
or exact presence. This repository change does not deploy the script or run the
migration; the operator must perform those steps in Apps Script.

The optional MailApp copy is sent only after the Form response is saved. If delivery
fails, the saved check-in remains successful and the browser shows a separate warning.

## LAO

1. Create a separate standalone Apps Script project and paste `lao.gs`.
2. In **Project Settings → Script properties**, add `LAO_SECRET` with a strong secret
   value.
3. Automatic Google Forms email collection must be **OFF** for this programmatic
   bridge. The Form contains the required explicit text item `Correo Electrónico`
   (item ID `1849920835`). Run `setupLaoEmailField()` from the Apps Script editor;
   the helper disables automatic collection, keeps the explicit item required, and
   logs its actual ID.
4. Deploy the project as an independent web app that accepts POST requests from the
   SeLIAR server. Authorize `MailApp` when prompted, then redeploy the updated script.
5. Configure the application server with:
   - `GOOGLE_APPS_SCRIPT_LAO_URL`
   - `GOOGLE_APPS_SCRIPT_LAO_SECRET`

The bridge resolves `Correo Electrónico` by title at submission time and submits the
first day of the selected start month to the existing Google Forms date item. It sends
the optional copy only when the validated `emailRequested` request value is true,
after saving the response. It validates the requested dates and email address, but does not attempt to enforce
seniority or simultaneous-license limits because those values are not collected by
the Form. The Form response is saved before the MailApp copy is sent; if email
delivery fails, the saved request still succeeds and the browser shows a warning.

## Published schedule viewer

This viewer uses its own standalone Apps Script project. Paste `PublishedSchedule.gs` into
that project; do not add it to `Code.gs` or another form bridge. In **Project Settings →
Script properties**, configure:

- `PUBLISHED_SCHEDULE_FOLDER_ID`: the ID of the Drive folder that contains the one current PDF.
- `PUBLISHED_SCHEDULE_SECRET`: a strong shared secret.

Deploy the script as a web app that accepts requests from the app server. Configure the
server-only variables `GOOGLE_APPS_SCRIPT_SCHEDULE_URL` and
`GOOGLE_APPS_SCRIPT_SCHEDULE_SECRET` in the hosting environment. The browser calls a
TanStack server function; it never receives either the Apps Script URL or shared secret.

The endpoint fails closed unless the folder contains exactly one file and that file has
the `application/pdf` MIME type. After deployment, make the current PDF viewable by the
intended app audience. In the file's Drive sharing/settings controls, disable reader
download, print, and copy when those controls are available. The app embeds Drive's
preview and has no download button or archive list. These settings do not prevent
screenshots or other technical capture of content that a reader can view.

### Coordinator update procedure

Replace the existing PDF in the configured folder rather than adding another file:
remove or move the old PDF out of that folder, then add the new PDF. Keep the folder ID
and file-sharing settings unchanged. The app reads the folder on each request, so the
same `/horarios` route picks up the replacement without a frontend edit or redeployment.
Do not keep prior schedules in this folder; the endpoint intentionally reports an error
if it finds more than one file or a non-PDF file.

## Future bridges

For each new form, create a separate flat `.gs` bridge, deploy it independently,
and add a dedicated pair of server-only URL and secret environment variables. Keep
the Form ID and Script Property key scoped to that bridge.
