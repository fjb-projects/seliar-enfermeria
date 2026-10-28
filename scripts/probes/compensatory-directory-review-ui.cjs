const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const esbuild = require("esbuild");
const { chromium } = require(process.argv[2] || "playwright");
const repo = path.resolve(__dirname, "../..");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "comp-review-ui-"));
const bundle = path.join(dir, "fixture.js");
const plugin = {
  name: "fake-bank-api",
  setup(build) {
    build.onResolve(
      { filter: /^@\/lib\/compensatory-(bank|requests)\.functions$/ },
      ({ path }) => ({
        path: path.endsWith("requests.functions") ? "fake-request-api" : "fake-bank-api",
        namespace: "fixture",
      }),
    );
    build.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
      loader: "js",
      contents:
        path === "fake-request-api"
          ? "export const insertCompensatoryRequest=async()=>({status:'stored'}); export const listCompensatoryRequests=async()=>[];"
          : "export const createCompensatoryStaff=()=>{}; export const getCompensatoryHistory=()=>{}; export const listCompensatoryStaff=()=>{}; export const recordCompensatoryMovement=()=>{}; export const reverseCompensatoryMovement=()=>{}; export const updateCompensatoryStaff=()=>{};",
    }));
  },
};

const headers = [
  "D.N.I.",
  "MATRICULA",
  "APELLIDO Y NOMBRE",
  "SIT DE REVISTA",
  "FUNCION",
  "REGION",
  "contacto",
  "LUGAR DE DESEMPEÑO",
  "OBS.",
  "OPERATIVO",
  "FUNCION",
];
function csvRow(values) {
  return values.map((value) => `"${value.replaceAll('"', '""')}"`).join(",");
}
function roster(name, dni, workplace) {
  return [
    csvRow(headers),
    csvRow([
      dni,
      "MAT-FAKE",
      name,
      "Planta",
      "Función de prueba",
      "Sur",
      "",
      workplace,
      "NO-RENDER",
      "Activa",
      "Rol de prueba",
    ]),
  ].join("\r\n");
}
function request(responseId, answers) {
  return {
    responseId,
    submittedAt: "2026-10-01T12:00:00.000Z",
    answers: Object.entries(answers).map(([field, value]) => ({
      field,
      itemId: `fake-${field}`,
      itemType: "TEXT",
      value,
    })),
  };
}
function jsonExport() {
  return JSON.stringify({
    schemaVersion: 1,
    exportedAt: "2026-10-28T10:00:00.000Z",
    source: { kind: "google-forms", formId: "synthetic-form" },
    responseCount: 2,
    responses: [
      request("synthetic-request-valid", {
        requesterName: "Ana Pérez",
        requesterMobile: "Ambulance 4",
        compensatoryDate: "2026-10-03",
        hours: "2",
        requesterEmail: "new@example.test",
      }),
      request("synthetic-request-invalid", {
        requesterMobile: "Ambulance 5",
        compensatoryDate: "2026-10-03",
        hours: "1",
      }),
    ],
  });
}
async function main() {
  await esbuild.build({
    entryPoints: [path.join(__dirname, "compensatory-directory-review-ui.fixture.jsx")],
    outfile: bundle,
    bundle: true,
    platform: "browser",
    format: "iife",
    globalName: "ReviewFixture",
    jsx: "automatic",
    alias: { "@": path.join(repo, "src") },
    nodePaths: [path.join(repo, "node_modules")],
    plugins: [plugin],
    logLevel: "silent",
  });
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  const server = http.createServer((_request, response) =>
    response.end('<!doctype html><html><body><div id="mount"></div></body></html>'),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("pageerror", (error) => {
    throw error;
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.addScriptTag({ path: bundle });
  await page.evaluate(() => window.mountLocalReview());
  const results = [];

  const opaqueIds = JSON.parse(jsonExport());
  opaqueIds.responses = ["constructor", "__proto__", "toString"].map((responseId) => ({
    ...opaqueIds.responses[0],
    responseId,
  }));
  opaqueIds.responseCount = opaqueIds.responses.length;
  await page.locator("#source-requests").setInputFiles({
    name: "opaque-ids.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(opaqueIds)),
  });
  await page.getByText("Referencia de origen: constructor", { exact: false }).waitFor();
  results.push({
    probe: "inherited-property response IDs never appear preconfirmed",
    passed: (await page.getByText("Confirmada localmente").count()) === 0,
  });

  await page.evaluate(() => {
    const originalText = File.prototype.text;
    File.prototype.text = function () {
      if (this.name !== "parallel.csv") return originalText.call(this);
      return new Promise((resolve) => setTimeout(() => originalText.call(this).then(resolve), 120));
    };
  });
  await page.locator("#source-roster").setInputFiles({
    name: "parallel.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(roster("Concurrent Synthetic", "12345678", "Concurrent Base")),
  });
  await page.locator("#source-requests").setInputFiles({
    name: "parallel.json",
    mimeType: "application/json",
    buffer: Buffer.from(jsonExport()),
  });
  await page.getByText("synthetic-request-valid").waitFor();
  await page.waitForTimeout(200);
  results.push({
    probe: "independent CSV and JSON reads both complete",
    passed: (await page.getByText("Concurrent Synthetic").count()) > 0,
  });

  await page.locator("#source-roster").setInputFiles({
    name: "first.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(roster("Ana Pérez", "12345678", "Old Synthetic Base")),
  });
  await page.locator("#source-requests").setInputFiles({
    name: "requests.json",
    mimeType: "application/json",
    buffer: Buffer.from(jsonExport()),
  });
  await page.getByText("synthetic-request-valid").waitFor();
  const autoLinked = await page.getByText("Confirmada localmente").count();
  results.push({ probe: "local files do not auto-confirm links", passed: autoLinked === 0 });
  const invalidTargetDisabled = await page
    .locator("#target-synthetic-request-invalid")
    .isDisabled();
  results.push({ probe: "invalid request cannot be confirmed", passed: invalidTargetDisabled });

  await page.locator("#target-synthetic-request-valid").selectOption("12345678");
  await page.getByRole("button", { name: "Confirmar para esta revisión" }).first().click();
  await page.getByText("Confirmada localmente").waitFor();
  const confirmedCount = await page.getByText("Confirmada localmente").count();
  results.push({ probe: "explicit confirmation uses source row", passed: confirmedCount === 1 });
  await page.getByRole("button", { name: "Deshacer vínculo local" }).click();
  results.push({
    probe: "undo is local",
    passed: (await page.getByText("Confirmada localmente").count()) === 0,
  });

  await page.locator("#target-synthetic-request-valid").selectOption("12345678");
  await page.getByRole("button", { name: "Confirmar para esta revisión" }).first().click();
  await page.getByText("Confirmada localmente").waitFor();
  await page.evaluate(() => {
    const originalText = File.prototype.text;
    File.prototype.text = function () {
      if (this.name !== "slow.csv") return originalText.call(this);
      return new Promise((resolve) => setTimeout(() => originalText.call(this).then(resolve), 120));
    };
  });
  await page.locator("#source-roster").setInputFiles({
    name: "slow.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(roster("Stale Synthetic", "22334455", "Stale Base")),
  });
  const clearedOnReplacement = (await page.getByText("Confirmada localmente").count()) === 0;
  await page.locator("#source-roster").setInputFiles({
    name: "new.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(roster("Fresh Synthetic", "99887766", "Fresh Base")),
  });
  await page.getByText("Fresh Synthetic").first().waitFor();
  await page.waitForTimeout(180);
  const staleDiscarded =
    (await page.getByText("Stale Synthetic").count()) === 0 &&
    (await page.getByText("Fresh Synthetic").count()) > 0;
  results.push({
    probe: "file replacement clears links and discards stale text read",
    passed: clearedOnReplacement && staleDiscarded,
  });
  results.push({
    probe: "OBS source value is never rendered",
    passed: (await page.getByText("NO-RENDER").count()) === 0,
  });
  await page.locator("#source-roster").setInputFiles({
    name: "oversized.csv",
    mimeType: "text/csv",
    buffer: Buffer.alloc(2 * 1024 * 1024 + 1),
  });
  results.push({
    probe: "oversized file is rejected without leaving a loading state",
    passed:
      (await page
        .getByRole("alert")
        .filter({ hasText: "supera el límite local de 2 MB" })
        .count()) === 1 &&
      (await page.getByRole("status").filter({ hasText: "Leyendo archivo local" }).count()) === 0,
  });

  await page.getByRole("button", { name: "Volver al banco" }).click();
  await page.locator("#profile-name").waitFor();
  const summaries = page.locator("details summary", { hasText: "Datos laborales y contacto" });
  await summaries.last().click();
  const profileFields = [
    "registrationNumber",
    "employmentStatus",
    "jobRole",
    "region",
    "contactPhone",
    "workplace",
    "operationalStatus",
    "operationalRole",
  ];
  for (const [index, key] of profileFields.entries())
    await page.locator(`#profile-${key}`).fill(index === 3 ? "" : `synthetic-${key}`);
  await page.locator("#profile-reason").fill("Synthetic test update");
  const profileForm = page.locator("#profile-reason").locator("xpath=ancestor::form");
  await profileForm.getByRole("button", { name: "Guardar perfil" }).click();
  await page.waitForFunction(() => window.__uiProbe.updated.length === 1);
  const updatePayload = await page.evaluate(() => window.__uiProbe.updated[0]);
  const profileKeysPresent = profileFields.every((key) =>
    Object.prototype.hasOwnProperty.call(updatePayload, key),
  );
  results.push({
    probe: "profile submit sends all eight audit fields and explicit nulls",
    passed:
      profileKeysPresent &&
      updatePayload.region === null &&
      updatePayload.jobRole === "synthetic-jobRole",
  });

  const createForm = page.locator("#new-name").locator("xpath=ancestor::form");
  await page.locator("#new-dni").fill("12345679");
  await page.locator("#new-name").fill("Agente Sintético Nuevo");
  const createSummary = createForm.locator("details summary", {
    hasText: "Datos laborales y contacto",
  });
  await createSummary.click();
  for (const key of profileFields) await page.locator(`#staff-${key}`).fill(`new-${key}`);
  await createForm.getByRole("button", { name: "Crear agente" }).click();
  await page.waitForFunction(() => window.__uiProbe.created.length === 1);
  const createPayload = await page.evaluate(() => window.__uiProbe.created[0]);
  results.push({
    probe: "create submit sends all eight directory fields",
    passed: profileFields.every((key) => createPayload[key] === `new-${key}`),
  });

  await page.getByRole("button", { name: "Revisar vinculaciones" }).click();
  await page.locator("#source-roster").setInputFiles({
    name: "request-review.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(roster("Ana Pérez", "12345679", "Request Review Base")),
  });
  await page.locator("#source-requests").setInputFiles({
    name: "request-review.json",
    mimeType: "application/json",
    buffer: Buffer.from(jsonExport()),
  });
  await page.getByText("synthetic-request-valid").waitFor();
  await page.locator("#target-synthetic-request-valid").selectOption("12345679");
  results.push({
    probe: "source confirmation alone does not persist a request",
    passed:
      (await page.evaluate(() => window.__uiProbe.requestCalls.length)) === 0 &&
      (await page
        .locator("button:enabled")
        .filter({ hasText: /^Vincular y guardar$/ })
        .count()) === 1,
  });
  await page
    .locator("button:enabled")
    .filter({ hasText: /^Vincular y guardar$/ })
    .click();
  await page.getByText("Se encontraron 1 solicitudes parecidas", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Guardar igualmente tras revisar" }).click();
  await page.locator("#source-filter").selectOption("stored");
  await page.getByText("Solicitud guardada en el historial del agente.").waitFor();
  const requestCalls = await page.evaluate(() => window.__uiProbe.requestCalls);
  results.push({
    probe:
      "duplicate requests require explicit confirmation with unchanged payload and operation ID",
    passed:
      requestCalls.length === 2 &&
      requestCalls[0].clientOperationId === requestCalls[1].clientOperationId &&
      requestCalls[0].confirmDuplicate === undefined &&
      requestCalls[1].confirmDuplicate === true &&
      requestCalls[0].staffId === "staff-fake-new" &&
      requestCalls.every((request) => !Object.prototype.hasOwnProperty.call(request, "responseId")),
  });
  await page.getByRole("button", { name: "Copiar correo revisado al perfil" }).click();
  await page.getByText("Correo copiado al perfil con auditoría.").waitFor();
  const copiedEmail = await page.evaluate(() => window.__uiProbe.updated.at(-1));
  results.push({
    probe: "request email is copied only by explicit audited profile update",
    passed:
      copiedEmail.email === "new@example.test" &&
      copiedEmail.reason.includes("revisado") &&
      copiedEmail.clientOperationId &&
      copiedEmail.expectedVersion === 1,
  });
  await page.getByRole("button", { name: "Deshacer vínculo local" }).click();
  await page.locator("#source-filter").selectOption("all");
  await page.locator("#target-synthetic-request-valid").selectOption("12345679");
  results.push({
    probe: "undo and relink does not reuse a saved status",
    passed:
      (await page
        .locator("button:enabled")
        .filter({ hasText: /^Vincular y guardar$/ })
        .count()) === 1,
  });
  const changedExport = JSON.parse(jsonExport());
  changedExport.responses[0].answers.find((answer) => answer.field === "requesterEmail").value =
    "changed@example.test";
  await page.locator("#source-requests").setInputFiles({
    name: "replacement.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(changedExport)),
  });
  await page.locator("#target-synthetic-request-valid").selectOption("12345679");
  results.push({
    probe: "file replacement does not reuse saved or copied statuses",
    passed:
      (await page
        .locator("button:enabled")
        .filter({ hasText: /^Vincular y guardar$/ })
        .count()) === 1 &&
      (await page.getByRole("button", { name: "Copiar correo revisado al perfil" }).count()) === 1,
  });
  await page.evaluate(() => {
    window.__uiProbe.pauseRequest = true;
  });
  await page
    .locator("button:enabled")
    .filter({ hasText: /^Vincular y guardar$/ })
    .click();
  await page.waitForFunction(() => Boolean(window.__uiProbe.resumeRequest));
  results.push({
    probe: "pending writes prevent undo and file replacement",
    passed:
      (await page.getByRole("button", { name: "Deshacer vínculo local" }).isDisabled()) &&
      (await page.locator("#source-roster").isDisabled()) &&
      (await page.locator("#source-requests").isDisabled()),
  });
  await page.evaluate(() => {
    window.__uiProbe.pauseRequest = false;
    window.__uiProbe.resumeRequest();
  });
  await page.getByText("Se encontraron 1 solicitudes parecidas", { exact: false }).waitFor();
  const stateChecks = results.slice(-3);
  if (stateChecks.some((result) => !result.passed) || process.argv.includes("--state-only")) {
    for (const result of stateChecks)
      console.log(`${result.passed ? "PASS" : "FAIL"}: ${result.probe}`);
    await browser.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    if (stateChecks.some((result) => !result.passed)) process.exitCode = 1;
    return;
  }
  await page.getByRole("button", { name: "Volver al banco" }).click();
  await page.getByText("Historial de solicitudes guardadas", { exact: true }).waitFor();
  const profileEmail = await page.locator("#profile-email").inputValue();
  const historyCard = page
    .getByText("Historial de solicitudes guardadas", { exact: true })
    .locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
  await historyCard.getByText("2026-10-03", { exact: false }).waitFor();
  const requestHistoryText = await historyCard.innerText();
  results.push({
    probe: "stored requests appear in selected staff history without source response ID",
    passed:
      profileEmail === "new@example.test" &&
      requestHistoryText.includes("2026-10-03") &&
      requestHistoryText.includes("Ambulance 4") &&
      !requestHistoryText.includes("synthetic-request-valid"),
  });

  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  for (const result of results) console.log(`${result.passed ? "PASS" : "FAIL"}: ${result.probe}`);
  if (results.some((result) => !result.passed)) process.exitCode = 1;
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
