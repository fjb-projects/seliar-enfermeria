const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const esbuild = require("esbuild");
const { chromium } = require(process.argv[2] || "playwright");
const repo = path.resolve(__dirname, "../..");
const dir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "comp-bank-ui-"));
const bundle = path.join(dir, "fixture.js");
const plugin = {
  name: "safe-fixture-module-stubs",
  setup(build) {
    build.onResolve(
      { filter: /^@\/lib\/compensatory-(bank|requests)\.functions$/ },
      ({ path }) => ({
        path: path.endsWith("requests.functions")
          ? "comp-request-functions"
          : "comp-bank-functions",
        namespace: "fixture",
      }),
    );
    build.onResolve({ filter: /^@tanstack\/react-router$/ }, () => ({
      path: "router",
      namespace: "fixture",
    }));
    build.onLoad({ filter: /.*/, namespace: "fixture" }, (args) =>
      args.path === "router"
        ? {
            loader: "js",
            resolveDir: repo,
            contents:
              "import React from 'react'; export const Link=({to,children,...props})=>React.createElement('a',{href:to,...props},children);",
          }
        : {
            loader: "js",
            contents:
              args.path === "comp-request-functions"
                ? "export const insertCompensatoryRequest=async()=>({status:'stored'}); export const listCompensatoryRequests=async()=>[];"
                : "export const listCompensatoryStaff=()=>{}; export const getCompensatoryHistory=()=>{}; export const createCompensatoryStaff=()=>{}; export const updateCompensatoryStaff=()=>{}; export const recordCompensatoryMovement=()=>{}; export const reverseCompensatoryMovement=()=>{};",
          },
    );
  },
};
(async () => {
  await esbuild.build({
    entryPoints: [path.join(__dirname, "compensatory-bank-ui.fixture.jsx")],
    outfile: bundle,
    bundle: true,
    platform: "browser",
    format: "iife",
    globalName: "BankFixture",
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
  const origin = `http://127.0.0.1:${server.address().port}`;
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("pageerror", (error) => console.error("PAGEERROR", error.message));
  await page.goto(origin);
  await page.addScriptTag({ path: bundle });
  const results = [];

  await page.evaluate(() => window.resetBankState());
  await page.evaluate(() => window.mountBank());
  await page.locator("#staff-select").waitFor();
  const initialControls = await page.evaluate(() => ({
    selector: document.querySelector("#staff-select")?.tagName,
    datalist: document.querySelectorAll("#staff-select-options option").length,
    closed: [...document.querySelectorAll(".compensatory-bank-panel details")].every(
      (item) => !item.open,
    ),
    hoursVisible: [...document.querySelectorAll("h3, [class*='font-semibold']")].some(
      (item) => item.textContent === "Registrar horas",
    ),
  }));
  results.push({
    probe: "agent search and optional bank controls start compact",
    actual: initialControls,
    passed:
      initialControls.selector === "INPUT" &&
      initialControls.datalist === 2 &&
      initialControls.closed &&
      initialControls.hoursVisible,
  });
  await page.locator("details summary").filter({ hasText: "Editar ficha" }).click();
  await page.locator("#profile-name").waitFor();
  await page.locator("#profile-name").fill("Ana draft");
  await page.locator("#staff-select").fill("Beatriz Agente");
  results.push({
    probe: "partial agent label cannot silently select a staff record",
    passed: !(await page.locator("#movement-kind").count()),
  });
  await page.locator("#staff-select").fill("Beatriz Agente · DNI 30987654");
  await page.waitForTimeout(80);
  const switchedName = await page.locator("#profile-name").inputValue();
  results.push({
    probe: "profile draft on staff switch",
    expected: "Beatriz Agente",
    actual: switchedName,
    passed: switchedName === "Beatriz Agente",
  });

  await page.evaluate(() => {
    window.resetBankState();
    window.__probeState.failFirstAfterCommit = true;
    window.mountBank();
  });
  await page.locator("#movement-kind").selectOption("credit");
  await page.locator("#movement-hours").fill("2");
  await page.locator("#movement-minutes").fill("15");
  await page.locator("#movement-effective-date").fill("2026-10-27");
  await page.locator("#movement-reason").fill("Approved existing overtime evidence");
  const movementForm = page.locator("form").filter({ has: page.locator("#movement-kind") });
  await movementForm.locator('button[type="submit"]').click();
  await page.getByRole("alert").filter({ hasText: "Simulated timeout after commit" }).waitFor();
  const firstOperationIds = await page.evaluate(() => [...window.__probeState.movementCalls]);
  await movementForm.locator('button[type="submit"]').click();
  await page.getByRole("status").filter({ hasText: "Movimiento registrado" }).waitFor();
  const retryState = await page.evaluate(() => ({
    ids: [...window.__probeState.movementCalls],
    commits: window.__probeState.committed.size,
    balance: window.__probeState.staff[0].balanceMinutes,
  }));
  results.push({
    probe: "retry after unknown committed outcome",
    firstOperationIds,
    actual: retryState,
    passed:
      retryState.ids.length === 2 &&
      retryState.ids[0] === retryState.ids[1] &&
      retryState.commits === 1 &&
      retryState.balance === 135,
  });

  await page.evaluate(() => {
    window.resetBankState();
    window.__probeState.delayedHistory = true;
    window.mountBank();
  });
  await page.locator("details summary").filter({ hasText: "Movimientos recientes" }).click();
  await page.waitForFunction(() => window.__probeState.historyCalls.includes("staff-a"));
  await page.locator("#staff-select").fill("Beatriz Agente · DNI 30987654");
  await page.getByText("BEATRICE-LEDGER").waitFor();
  await page.evaluate(() => window.resolveDelayedA());
  await page.waitForTimeout(100);
  const staleText = await page.locator("#mount").innerText();
  results.push({
    probe: "stale history response after switching staff",
    expected: "BEATRICE-LEDGER only",
    hasBeatriz: staleText.includes("BEATRICE-LEDGER"),
    hasAna: staleText.includes("ANA-OLD-HISTORY"),
    passed: staleText.includes("BEATRICE-LEDGER") && !staleText.includes("ANA-OLD-HISTORY"),
  });

  console.log(JSON.stringify({ scratch: dir, results }, null, 2));
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  if (results.some((item) => !item.passed)) process.exitCode = 2;
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
