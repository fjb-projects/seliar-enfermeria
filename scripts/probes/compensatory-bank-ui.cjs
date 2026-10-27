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
    build.onResolve({ filter: /^@\/lib\/compensatory-bank\.functions$/ }, () => ({
      path: "comp-bank-functions",
      namespace: "fixture",
    }));
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
              "export const listCompensatoryStaff=()=>{}; export const getCompensatoryHistory=()=>{}; export const createCompensatoryStaff=()=>{}; export const updateCompensatoryStaff=()=>{}; export const recordCompensatoryMovement=()=>{}; export const reverseCompensatoryMovement=()=>{};",
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
  await page.getByLabel("Nombre", { exact: true }).waitFor();
  await page.locator("#profile-name").fill("Ana draft");
  await page.locator("#staff-select").selectOption("staff-b");
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
  await page.waitForFunction(() => window.__probeState.historyCalls.includes("staff-a"));
  await page.locator("#staff-select").selectOption("staff-b");
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

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => window.mountLayout());
  const aside = page.locator('aside[aria-label="Coordinación"]');
  const before = await aside.getAttribute("data-state");
  await page.getByRole("button", { name: "Contraer o expandir el panel lateral" }).click();
  const after = await aside.getAttribute("data-state");
  results.push({
    probe: "desktop sidebar collapse control",
    before,
    after,
    passed: before === "expanded" && after === "collapsed",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.mountLayout());
  await page.getByRole("button", { name: "Abrir navegación de coordinación" }).click();
  const mobileNavVisible = await page
    .getByRole("dialog")
    .getByRole("navigation", { name: "Navegación de coordinación" })
    .isVisible();
  results.push({
    probe: "mobile navigation sheet",
    visible: mobileNavVisible,
    passed: mobileNavVisible,
  });

  console.log(JSON.stringify({ scratch: dir, results }, null, 2));
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  if (results.some((item) => !item.passed)) process.exitCode = 2;
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
