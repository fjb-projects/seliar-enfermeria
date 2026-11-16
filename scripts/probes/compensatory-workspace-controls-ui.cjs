const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const esbuild = require("esbuild");
const { chromium } = require(process.argv[2] || "playwright");

const repo = path.resolve(__dirname, "../..");
const fixture = path.join(__dirname, "compensatory-workspace-controls-ui.fixture.jsx");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "compensatory-workspace-controls-"));
let browser;
let server;

const css = `
  * { box-sizing: border-box; }
  body { margin: 0; font: 16px system-ui, sans-serif; color: #1d3036; background: #faf9f5; }
  main { min-height: 160vh; padding: 1rem; }
  header { display: flex; align-items: center; gap: .75rem; }
  [role="tablist"] { position: relative; display: inline-grid; grid-template-columns: repeat(3,max-content); }
  [role="tab"] { min-height: 34px; padding: .3rem .6rem; white-space: nowrap; }
  [data-testid="compensatory-workspace-indicator"] { position: absolute; inset: 0 auto 0 0; background: #244c55; border-radius: .4rem .4rem 0 0; pointer-events: none; transition: transform .5s cubic-bezier(.22,1,.36,1), width .5s cubic-bezier(.22,1,.36,1); }
  [aria-selected="true"] { color: white; }
  nav[aria-label="Navegación principal"] { background: #edf0ef; }
  [data-testid="compensatory-workspace-mobile-dock"] { position: fixed; z-index: 40; left: 0; right: 0; display: none; justify-content: center; padding: .5rem; }
  [data-testid="compensatory-workspace-mobile-dock"] > div { display: flex; gap: .25rem; padding: .25rem; border-radius: 2rem; background: white; box-shadow: 0 4px 16px #0003; }
  [data-testid="compensatory-workspace-mobile-dock"] button { min-height: 44px; }
  [role="tabpanel"] { padding: 1rem; }
  [data-radix-dialog-overlay] { position: fixed; inset: 0; background: #0008; }
  [role="dialog"] { position: fixed; z-index: 100; inset: 50% auto auto 50%; transform: translate(-50%,-50%); width: min(90vw, 28rem); max-height: 85vh; overflow: auto; padding: 1rem; background: white; border: 1px solid #ddd; border-radius: 1rem; }
  [role="dialog"] button, [role="dialog"] input { min-height: 44px; }
  @media (max-width: 620px) {
    header { flex-wrap: wrap; }
    [aria-label="Alcance de las solicitudes"] { display: none; }
    [data-testid="compensatory-workspace-mobile-dock"] { display: flex; }
    [role="tab"] { min-height: 44px; padding-inline: .5rem; }
  }
  @media (min-width: 621px) { [data-testid="compensatory-workspace-mobile-dock"] { display: none; } }
  @media (prefers-reduced-motion: reduce) { [data-testid="compensatory-workspace-indicator"] { transition-duration: 0s; } }
`;

async function main() {
  await esbuild.build({
    entryPoints: [fixture],
    outfile: path.join(tempDir, "fixture.js"),
    bundle: true,
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    alias: { "@": path.join(repo, "src") },
    logLevel: "silent",
  });
  server = http.createServer((request, response) => {
    if (request.url === "/fixture.js") {
      response.setHeader("Content-Type", "text/javascript");
      response.end(fs.readFileSync(path.join(tempDir, "fixture.js")));
      return;
    }
    response.setHeader("Content-Type", "text/html");
    response.end(
      '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>' +
        css +
        '</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>',
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const checks = [];

  for (const width of [320, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByRole("tab", { name: "Pendientes" }).waitFor();
    const mobile = width <= 620;
    const dock = page.getByTestId("compensatory-workspace-mobile-dock");
    if ((await dock.isVisible()) !== mobile)
      throw Error(`Unexpected mobile dock visibility at ${width}px`);
    if (mobile) {
      const hitSize = await page
        .getByRole("button", { name: "General", exact: true })
        .evaluate((el) => el.getBoundingClientRect().height);
      if (hitSize < 44) throw Error(`General scope target is only ${hitSize}px high at ${width}px`);
      const gap = await page.evaluate(() => {
        const nav = document.querySelector('nav[aria-label="Navegación principal"]');
        const dockEl = document.querySelector('[data-testid="compensatory-workspace-mobile-dock"]');
        return nav.getBoundingClientRect().top - dockEl.getBoundingClientRect().bottom;
      });
      if (gap < -1) throw Error(`Scope dock overlaps the fixed global navigation at ${width}px`);
      await page.evaluate(() => {
        const nav = document.querySelector('nav[aria-label="Navegación principal"]');
        nav.style.height = "80px";
      });
      await page.waitForFunction(() => {
        const nav = document.querySelector('nav[aria-label="Navegación principal"]');
        const dockEl = document.querySelector('[data-testid="compensatory-workspace-mobile-dock"]');
        return (
          Math.abs(nav.getBoundingClientRect().top - dockEl.getBoundingClientRect().bottom) < 2
        );
      });
    } else if ((await page.getByLabel("Alcance de las solicitudes").isVisible()) !== true) {
      throw Error(`Desktop staff picker is not visible at ${width}px`);
    }
    const tabs = page.getByRole("tab");
    await tabs.first().focus();
    await page.keyboard.press("ArrowRight");
    await page.getByTestId("active-tab").getByText("scheduled").waitFor();
    await page.keyboard.press("End");
    await page.getByTestId("active-tab").getByText("history").waitFor();
    await page.keyboard.press("Home");
    await page.getByTestId("active-tab").getByText("pending").waitFor();
    const panelState = await page.locator('[role="tabpanel"]').evaluateAll((panels) =>
      panels.map((panel) => ({
        value: panel.textContent.trim().split(" ")[0],
        hidden: panel.hidden,
      })),
    );
    if (panelState.filter((panel) => !panel.hidden).length !== 1 || panelState[0].hidden)
      throw Error(`Tab panels are not exclusively revealed at ${width}px`);
    checks.push({ width, mobile, panels: panelState });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const dock = page.getByTestId("compensatory-workspace-mobile-dock");
  await dock.getByRole("button", { name: "Por agente: Vista general" }).click();
  const search = page.getByRole("searchbox", { name: "Buscar agente por nombre o DNI" });
  await search.fill("perez");
  await page.getByRole("option", { name: "Laura Pérez · DNI 30123456" }).click();
  await page.getByTestId("selected-staff").getByText("staff-laura").waitFor();
  await dock.getByRole("button", { name: "Por agente: Laura Pérez · DNI 30123456" }).click();
  await search.fill("marcos");
  await search.press("Escape");
  await page.getByTestId("selected-staff").getByText("staff-laura").waitFor();
  await dock.getByRole("button", { name: "Por agente: Laura Pérez · DNI 30123456" }).click();
  await expectEmptySearch();
  await search.press("Escape");
  await dock.getByRole("button", { name: "General", exact: true }).click();
  await page.getByTestId("selected-staff").getByText("general").waitFor();

  await page.getByRole("button", { name: "Toggle disabled" }).click();
  if (!(await page.getByRole("tab", { name: "Pendientes" }).isDisabled()))
    throw Error("Disabled workspace left a tab operable");
  if (!(await dock.getByRole("button", { name: "General", exact: true }).isDisabled()))
    throw Error("Disabled workspace left the mobile general scope operable");
  checks.push({
    mobileSearch: "accent-insensitive matching, exact staff id, cancel, General, disabled",
  });

  await page.emulateMedia({ reducedMotion: "reduce" });
  const reducedMotionDuration = await page
    .getByTestId("compensatory-workspace-indicator")
    .evaluate((indicator) => getComputedStyle(indicator).transitionDuration);
  if (parseFloat(reducedMotionDuration) !== 0)
    throw Error("Reduced motion did not disable the indicator transition");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("button", { name: "Toggle disabled" }).click();
  await page.getByRole("button", { name: "Por agente: Vista general" }).click();
  await page.getByLabel("Buscar agente por nombre o DNI").fill("maria");
  await page.getByRole("option", { name: "María Gómez · DNI 31234567" }).click();
  await page.getByTestId("selected-staff").getByText("staff-maria").waitFor();
  if (errors.length) throw Error(errors.join("\n"));
  console.log(JSON.stringify({ checks, reducedMotionDuration, synthetic: true }));

  async function expectEmptySearch() {
    const value = await page
      .getByRole("searchbox", { name: "Buscar agente por nombre o DNI" })
      .inputValue();
    if (value !== "") throw Error("Opening the agent sheet retained an abandoned filter");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
