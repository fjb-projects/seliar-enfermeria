const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const esbuild = require("esbuild");
const { chromium } = require(process.argv[2] || "playwright");
const repo = path.resolve(__dirname, "../..");
const scratch = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "coordination-nav-"));
const styles = process.argv[3] ? fs.readFileSync(process.argv[3], "utf8") : "";
const modules = {
  "@tanstack/react-router": `
    import React from 'react';
    export const useLocation=()=>{const [pathname,set]=React.useState(location.pathname);React.useEffect(()=>{const update=()=>set(location.pathname);window.addEventListener('popstate',update);return()=>window.removeEventListener('popstate',update)},[]);return{pathname}};
    export const Link=({to,children,onClick,...props})=>React.createElement('a',{...props,href:to,onClick:e=>{e.preventDefault();history.pushState({},'',to);window.dispatchEvent(new Event('popstate'));onClick?.(e)}},children);
    export const createFileRoute=()=>options=>({options,useRouteContext:()=>({session:window.__navSession}),useLoaderData:()=>({accounts:[],bases:[],institutions:[]})});
    export const redirect=()=>{};
    export const useRouter=()=>({invalidate:async()=>{}});
  `,
  "@tanstack/react-start": "export const useServerFn=()=>async()=>[];",
  "@/components/SeliarNavigationProvider":
    "export const useSeliarNavigation=()=>window.__navigation;",
  "@/lib/accounts.functions": "export const listAccounts=async()=>[];",
  "@/lib/efa-bases.functions": "export const listAdminBases=async()=>[];",
  "@/lib/efa-institutions.functions": "export const listAdminInstitutions=async()=>[];",
  "@/lib/auth.functions": "export const readSession=async()=>window.__navSession;",
  "@/lib/efa-guards.functions":
    "export const endEfaGuard=async()=>{}; export const listEfaGuards=async()=>[];",
  "@/lib/compensatory-bank.functions":
    "export const listCompensatoryStaff=async()=>[]; export const getCompensatoryHistory=async()=>({entries:[],changes:[]}); export const createCompensatoryStaff=async()=>{}; export const updateCompensatoryStaff=async()=>{}; export const recordCompensatoryMovement=async()=>{}; export const reverseCompensatoryMovement=async()=>{};",
};
for (const name of [
  "AccountAdminForm",
  "AccountAdminList",
  "AdminBaseCatalog",
  "AdminStaffingPlan",
  "AdminInstitutionCatalog",
]) {
  modules[`@/components/${name}`] =
    `import React from 'react'; export const ${name}=()=>React.createElement('p',null,'${name} fixture');`;
}
const plugin = {
  name: "synthetic-navigation-boundaries",
  setup(build) {
    build.onResolve({ filter: /.*/ }, ({ path: name }) =>
      modules[name] ? { path: name, namespace: "fixture" } : undefined,
    );
    build.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path: name }) => ({
      contents: modules[name],
      loader: "js",
      resolveDir: repo,
    }));
  },
};

(async () => {
  const bundle = path.join(scratch, "fixture.js");
  await esbuild.build({
    entryPoints: [path.join(__dirname, "coordination-navigation-ui.fixture.jsx")],
    outfile: bundle,
    bundle: true,
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    alias: { "@": path.join(repo, "src") },
    plugins: [plugin],
    logLevel: "silent",
  });
  const server = http.createServer((request, response) => {
    response.setHeader("Content-Type", request.url === "/styles.css" ? "text/css" : "text/html");
    response.end(
      request.url === "/styles.css"
        ? styles
        : '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="mount"></div></body></html>',
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  const checks = [];
  const check = (name, passed) => checks.push({ name, passed });
  try {
    browser = await chromium.launch({ headless: true, channel: "msedge" });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/coordinacion`);
    await page.addScriptTag({ path: bundle });
    await page.evaluate(() => window.mountNavigation());
    await page.getByRole("heading", { name: "Herramientas de coordinación" }).waitFor();
    const top = page.getByRole("navigation", { name: "Navegación principal", exact: true }).first();
    check(
      "desktop has a single general coordination entry",
      (await top.locator('a[href="/coordinacion"]').count()) === 1 &&
        (await top.locator('a[href="/admin-usuarios"],a[href="/coordinacion-efa"]').count()) === 0,
    );
    await page.screenshot({ path: path.join(scratch, "desktop-home.png"), fullPage: true });
    await page
      .getByRole("navigation", { name: "Navegación de coordinación", exact: true })
      .getByRole("link", { name: "Usuarios y accesos" })
      .click();
    await page.getByRole("heading", { name: "Administración de cuentas" }).waitFor();
    check(
      "accounts retain one sidebar and active users link",
      (await page.locator('aside[aria-label="Coordinación"]').count()) === 1 &&
        (await page.locator('aside a[href="/admin-usuarios"][aria-current="page"]').count()) === 1,
    );
    await page.getByLabel("Contraer o expandir el panel lateral").click();
    check(
      "accounts sidebar still collapses",
      (await page.locator('aside[data-state="collapsed"]').count()) === 1,
    );
    await page.getByLabel("Contraer o expandir el panel lateral").click();
    check(
      "account header does not duplicate tool shortcuts",
      (await page
        .locator(
          '#private-account-details a[href="/coordinacion"],#private-account-details a[href="/admin-usuarios"],#private-account-details a[href="/coordinacion-efa"]',
        )
        .count()) === 0,
    );
    await page.screenshot({ path: path.join(scratch, "desktop-accounts.png"), fullPage: true });
    await page
      .getByRole("navigation", { name: "Navegación de coordinación", exact: true })
      .getByRole("link", { name: "Compensatorios", exact: true })
      .click();
    await page.getByRole("button", { name: "Revisar vinculaciones" }).waitFor();
    check(
      "accounts link reaches the real bank component",
      page.url().endsWith("/coordinacion/compensatorios"),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    const bottom = page
      .getByRole("navigation", { name: "Navegación principal", exact: true })
      .last();
    const coordination = bottom.getByRole("link", { name: "Coordinación", exact: true });
    check(
      "mobile has a direct active coordination tab",
      (await coordination.getAttribute("aria-current")) === "page" &&
        (!styles || (await coordination.isVisible())),
    );
    await coordination.click();
    await page.getByRole("heading", { name: "Herramientas de coordinación" }).waitFor();
    await bottom.getByRole("button", { name: "Área privada", exact: true }).click();
    check(
      "mobile access menu does not repeat coordination or tools",
      (await bottom
        .locator(
          '#private-menu a[href="/coordinacion"],#private-menu a[href="/admin-usuarios"],#private-menu a[href="/coordinacion-efa"]',
        )
        .count()) === 0,
    );
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Abrir navegación de coordinación", exact: true })
      .click();
    await page.getByRole("dialog").getByRole("link", { name: "Usuarios y accesos" }).click();
    await page.getByRole("heading", { name: "Administración de cuentas" }).waitFor();
    check(
      "mobile users navigation closes sheet and preserves navigation control",
      (await page.getByRole("dialog").count()) === 0 &&
        (await page
          .getByRole("button", { name: "Abrir navegación de coordinación", exact: true })
          .count()) === 1,
    );
    await page.waitForTimeout(400);
    const mobileContent = await page.locator('[class*="@container/main"]').boundingBox();
    const navigationControl = await page
      .getByRole("button", { name: "Abrir navegación de coordinación", exact: true })
      .boundingBox();
    check(
      "mobile content is below navigation and uses the available width",
      !!mobileContent &&
        !!navigationControl &&
        mobileContent.width >= 312 &&
        mobileContent.x < 60 &&
        mobileContent.y >= navigationControl.y + navigationControl.height,
    );
    await page.screenshot({ path: path.join(scratch, "mobile-accounts.png"), fullPage: true });
    await page.evaluate(() => window.mountNavigation(true, false));
    await page.waitForTimeout(80);
    check(
      "admin coordination survives unavailable EFA summary",
      (await bottom.locator('a[href="/coordinacion"]').count()) === 1,
    );
    await page.evaluate(() => window.mountNavigation(false));
    await page.waitForTimeout(80);
    check(
      "non-admin navbar has no coordination entry",
      (await page
        .locator('nav[aria-label="Navegación principal"] a[href="/coordinacion"]')
        .count()) === 0,
    );
    check("no browser runtime errors", errors.length === 0);
    console.log(JSON.stringify({ scratch, styled: !!styles, checks, errors }, null, 2));
    if (checks.some(({ passed }) => !passed)) process.exitCode = 2;
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
