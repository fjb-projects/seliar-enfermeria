const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const esbuild = require("esbuild");
const { chromium } = require(process.argv[2] || "playwright");
const root = path.resolve(__dirname, "../..");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "compensatory-operational-"));
const stubs = {
  "@tanstack/react-router":
    "import React from 'react';export const Link=({to,children,...p})=>React.createElement('a',{...p,href:to},children);export const useLocation=()=>({pathname:'/coordinacion/compensatorios'});export const useRouter=()=>({invalidate:async()=>{}});",
  "@tanstack/react-start": "export const useServerFn=fn=>fn;",
  "@/components/SeliarNavigationProvider":
    "export const useSeliarNavigation=()=>window.navigationFixture;",
  "@/lib/efa-guards.functions":
    "export const endEfaGuard=async()=>{};export const listEfaGuards=async()=>[];",
  "@/lib/compensatory-lifecycle.functions":
    "export const getCompensatoryOperationalWorkspace=async()=>({});export const classifyCompensatoryRequest=async()=>{};export const decideCompensatoryRequest=async()=>{};export const cancelCompensatoryRequest=async()=>{};",
  "@/lib/compensatory-bank.functions":
    "export const listCompensatoryStaff=async()=>[];export const getCompensatoryHistory=async()=>({entries:[],changes:[]});export const createCompensatoryStaff=async()=>{};export const updateCompensatoryStaff=async()=>{};export const recordCompensatoryMovement=async()=>{};export const reverseCompensatoryMovement=async()=>{};",
  "@/lib/compensatory-requests.functions":
    "export const listCompensatoryRequests=async()=>[];export const insertCompensatoryRequest=async()=>({status:'stored'});",
  "@/lib/compensatory-staff-delete.functions": "export const deleteCompensatoryStaff=async()=>{};",
};
const css = process.argv[3]
  ? fs.readFileSync(process.argv[3], "utf8")
  : `body{font:14px system-ui;margin:0;padding:16px}button,input,select{min-height:36px}section[hidden]{display:none}[role=tablist]{display:inline-flex}[role=tabpanel]{padding:12px 0}[data-testid=compensatory-workspace-indicator]{display:none}[data-testid=compensatory-workspace-mobile-dock]{display:none}[role=dialog]{position:fixed;inset:5% 5% auto;max-height:85vh;overflow:auto;background:white;padding:16px;border:1px solid #ccc;z-index:100}[data-radix-dialog-overlay]{position:fixed;inset:0;background:#0005}article{display:flex;gap:16px;align-items:center;padding:12px}label{display:block}dl{display:grid;grid-template-columns:1fr 1fr}[role=tablist]~div{display:inline-block}`;
let server, browser;
(async () => {
  await esbuild.build({
    entryPoints: [path.join(__dirname, "compensatory-operational-ui.fixture.jsx")],
    outfile: path.join(dir, "fixture.js"),
    bundle: true,
    platform: "browser",
    jsx: "automatic",
    alias: { "@": path.join(root, "src") },
    plugins: [
      {
        name: "synthetic-boundaries",
        setup(build) {
          build.onResolve({ filter: /.*/ }, ({ path: name }) =>
            stubs[name] ? { path: name, namespace: "fixture" } : undefined,
          );
          build.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path: name }) => ({
            contents: stubs[name],
            loader: "js",
            resolveDir: root,
          }));
        },
      },
    ],
    logLevel: "silent",
  });
  server = http.createServer((_, res) => res.end(`<style>${css}</style><div id="root"></div>`));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1024, height: 900 } });
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.addScriptTag({ path: path.join(dir, "fixture.js") });
  const passed = [];
  const check = (condition, label) => {
    if (!condition) throw Error(label);
    passed.push(label);
  };
  const pending = page.getByRole("tabpanel", { name: "Pendientes", exact: true });
  await pending.getByRole("button", { name: "Revisar", exact: true }).waitFor();
  check(
    (await pending.getByRole("button", { name: "Revisar", exact: true }).count()) === 1,
    "unclassified evidence is not a pending decision",
  );
  await pending.getByRole("button", { name: "Revisar", exact: true }).click();
  await page.getByLabel("Decisión", { exact: true }).selectOption("approve");
  await page.getByLabel("Fundamento", { exact: true }).fill("Synthetic decision");
  await page.evaluate(() => {
    window.operationalProbe.timeoutAfterCommit = true;
  });
  await page.getByRole("button", { name: "Confirmar decisión", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Synthetic post-commit timeout" }).waitFor();
  await page.getByRole("button", { name: "Confirmar decisión", exact: true }).click();
  await page.getByRole("heading", { name: "Aprobados próximos" }).waitFor();
  check(
    await page.evaluate(() => {
      const c = window.operationalProbe.calls.filter((c) => c.kind === "decide");
      return (
        c.length === 2 &&
        c[0].clientOperationId === c[1].clientOperationId &&
        window.operationalProbe.writes === 1
      );
    }),
    "uncertain approval reuses operation and reserves only once",
  );
  const scheduled = page.getByRole("tabpanel", { name: "Programados", exact: true });
  await scheduled.getByRole("button", { name: "Ver detalle", exact: true }).click();
  await page.getByLabel("Fundamento", { exact: true }).fill("Synthetic cancellation");
  await page.getByRole("button", { name: "Cancelar y liberar reserva" }).click();
  await page.getByRole("heading", { name: "Historial cronológico de solicitudes" }).waitFor();
  check(
    await page.evaluate(
      () =>
        window.operationalProbe.calls.some((c) => c.kind === "cancel") &&
        window.operationalProbe.state.staff[0].reservedMinutes === 0,
    ),
    "cancel action calls cancellation API and releases reservation",
  );
  const history = page.getByRole("tabpanel", { name: "Historial", exact: true });
  await history
    .getByRole("article")
    .filter({ hasText: "Sin resolución registrada" })
    .getByRole("button", { name: "Ver detalle" })
    .click();
  await page.getByLabel("Fecha solicitada confirmada").fill("2026-10-31");
  await page.getByLabel("Horas", { exact: true }).fill("2");
  await page.getByLabel("Fundamento", { exact: true }).fill("Synthetic explicit classification");
  await page.getByRole("button", { name: "Enviar a pendientes" }).click();
  await pending.getByRole("button", { name: "Revisar", exact: true }).waitFor();
  check(
    await page.evaluate(() =>
      window.operationalProbe.calls.some(
        (c) => c.kind === "classify" && c.minutes === 120 && c.requestedDate === "2026-10-31",
      ),
    ),
    "explicit date and minutes classify raw evidence without inferred approval",
  );
  await page
    .getByRole("combobox", { name: "Alcance de las solicitudes" })
    .selectOption("11111111-1111-4111-8111-111111111111");
  await page.getByRole("button", { name: "Registrar horas", exact: true }).click();
  check(
    await page.getByRole("dialog").getByLabel("Tipo de movimiento").isVisible(),
    "hours CTA opens real existing movement form only",
  );
  check(
    (await page.getByRole("dialog").getByText("Nuevo agente", { exact: true }).count()) === 0,
    "focused movement dialog excludes unrelated agent form",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Herramientas", exact: true }).click();
  await page.getByRole("button", { name: "Importar CSV / vincular JSON" }).click();
  await page.locator("#source-requests").waitFor();
  check(true, "existing JSON import and mapping remain accessible");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Herramientas", exact: true }).click();
  await page.getByRole("button", { name: "Editar ficha / desactivar / eliminar" }).click();
  await page.locator("#profile-name").waitFor();
  check(
    await page.locator("#delete-agent-form").isVisible(),
    "profile preserves guarded deletion and deactivation",
  );
  await page.keyboard.press("Escape");
  const fillCredit = async () => {
    await page.getByRole("button", { name: "Registrar horas", exact: true }).click();
    await page.locator("#movement-kind").selectOption("credit");
    await page.locator("#movement-hours").fill("1");
    await page.locator("#movement-minutes").fill("0");
    await page.locator("#movement-reason").fill("Synthetic credit retry");
  };
  await page.evaluate(() => {
    window.operationalProbe.failCreditOnce = true;
  });
  await fillCredit();
  await page.getByRole("button", { name: "Registrar movimiento", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Synthetic bank timeout" }).waitFor();
  await page.keyboard.press("Escape");
  await fillCredit();
  await page.getByRole("button", { name: "Registrar movimiento", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  check(
    await page.evaluate(() => {
      const p = window.operationalProbe;
      return p.bankCalls.length === 2 && p.bankCalls[0] === p.bankCalls[1] && p.bankWrites === 1;
    }),
    "uncertain credit retains operation identity across dialog close and reopen",
  );
  await page.getByRole("button", { name: "Herramientas", exact: true }).click();
  await page.getByRole("button", { name: "Importar CSV / vincular JSON" }).click();
  await page.evaluate(() => {
    window.operationalProbe.holdImport = true;
  });
  await page.locator("#source-roster").setInputFiles({
    name: "synthetic.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      '"D.N.I.","MATRICULA","APELLIDO Y NOMBRE","SIT DE REVISTA","FUNCION","REGION","contacto","LUGAR DE DESEMPEÑO","OBS.","OPERATIVO","FUNCION"\r\n"87654321","MAT-FAKE","Synthetic Import","Planta","Test","Sur","","Base","","Activa","Role"',
    ),
  });
  await page.getByText("Editar ficha antes de importar", { exact: true }).click();
  await page.getByRole("button", { name: "Importar agente", exact: true }).click();
  await page.waitForFunction(() => Boolean(window.operationalProbe.releaseImport));
  await page.keyboard.press("Escape");
  check(
    (await page.locator("#source-roster").isVisible()) &&
      (await page.getByRole("button", { name: "Volver al banco", exact: true }).isDisabled()),
    "Escape and explicit back preserve in-flight import state",
  );
  await page.evaluate(() => {
    window.operationalProbe.holdImport = false;
    window.operationalProbe.releaseImport();
  });
  await page.getByRole("button", { name: "Volver al banco", exact: true }).waitFor();
  await page.getByRole("button", { name: "Volver al banco", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  check(errors.length === 0, `no browser exceptions: ${errors.join("; ")}`);
  await page.screenshot({ path: path.join(dir, "desktop.png"), fullPage: true });
  if (process.argv[3]) {
    for (const width of [768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(dir, `layout-${width}.png`), fullPage: true });
      const layout = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        dock: document
          .querySelector('[data-testid="compensatory-workspace-mobile-dock"]')
          ?.getBoundingClientRect()
          .toJSON(),
        nav: document
          .querySelector('nav[aria-label="Navegación principal"]')
          ?.getBoundingClientRect()
          .toJSON(),
      }));
      check(!layout.overflow, `actual compiled CSS fits viewport ${width}`);
      if (width <= 620)
        check(layout.dock.bottom <= layout.nav.top + 1, `mobile dock clears navbar at ${width}`);
    }
  }
  console.log(JSON.stringify({ passed, screenshots: dir }));
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close();
    server?.close();
  });
