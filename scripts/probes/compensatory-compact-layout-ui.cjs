const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const esbuild = require("esbuild");
const { chromium } = require(process.argv[2] || "playwright");
const repo = path.resolve(__dirname, "../..");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "compact-layout-"));
const css = fs.readFileSync(process.argv[3], "utf8");
const modules = {
  "@tanstack/react-router": `import React from 'react';export const Link=({to,children,...p})=>React.createElement('a',{...p,href:to},children);export const useLocation=()=>({pathname:'/coordinacion/compensatorios'});export const useRouter=()=>({invalidate:async()=>{}});`,
  "@tanstack/react-start": "export const useServerFn=fn=>fn;",
  "@/components/SeliarNavigationProvider":
    "export const useSeliarNavigation=()=>window.navigationFixture;",
  "@/lib/efa-guards.functions":
    "export const endEfaGuard=async()=>{};export const listEfaGuards=async()=>[];",
  "@/lib/compensatory-bank.functions":
    "export const listCompensatoryStaff=async()=>[];export const getCompensatoryHistory=async()=>({entries:[],changes:[]});export const createCompensatoryStaff=async()=>{};export const updateCompensatoryStaff=async()=>{};export const recordCompensatoryMovement=async()=>{};export const reverseCompensatoryMovement=async()=>{};",
  "@/lib/compensatory-requests.functions":
    "export const listCompensatoryRequests=async()=>[];export const insertCompensatoryRequest=async()=>({status:'stored'});",
};
let browser, server;
async function main() {
  await esbuild.build({
    stdin: {
      resolveDir: repo,
      loader: "jsx",
      contents: `
      import React from 'react';import {createRoot} from 'react-dom/client';
      import {SeliarMobileNav} from '@/components/SeliarMobileNav';
      import {PrivateAccountShell} from '@/components/PrivateAccountShell';
      import {CoordinationAdminLayout} from '@/components/CoordinationAdminLayout';
      import {CompensatoryBankPanel} from '@/components/CompensatoryBankPanel';
      const session={user:{id:'synthetic',name:'Synthetic Admin',email:'admin@example.test'},roles:['admin'],expiresAt:'2030-01-01'};
      window.navigationFixture={sessionStatus:'authenticated',session,summary:{isAdmin:true,canWrite:true,openGuard:null},quickGuardEnd:{visible:false,openGuard:null,confirmTarget:null,pending:false},requestLogout:()=>{},retrySummary:()=>{},retrySession:()=>{},logoutPending:false,logoutError:''};
      const staff=[{id:'synthetic-staff',dni:'12345678',name:'Synthetic Agent',email:null,isActive:true,monthlyLimitMinutes:1440,version:1,balanceMinutes:120,createdAt:'2026-10-01'}];
      createRoot(document.getElementById('root')).render(<><SeliarMobileNav/><PrivateAccountShell session={session} title='Coordinación' contentWidth='full' surface='calm' compactLayout><CoordinationAdminLayout active='compensatorios'><CompensatoryBankPanel initialStaff={staff}/></CoordinationAdminLayout></PrivateAccountShell></>);
    `,
    },
    outfile: path.join(dir, "fixture.js"),
    bundle: true,
    platform: "browser",
    jsx: "automatic",
    alias: { "@": path.join(repo, "src") },
    plugins: [
      {
        name: "synthetic-boundaries",
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
      },
    ],
    logLevel: "silent",
  });
  server = http.createServer((req, res) => {
    res.setHeader("Content-Type", req.url === "/styles.css" ? "text/css" : "text/html");
    res.end(
      req.url === "/styles.css"
        ? css
        : '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div></body></html>',
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  browser = await chromium.launch({ headless: true, channel: "msedge" });
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const checks = [];
  for (const [width, height] of [
    [1280, 900],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.addScriptTag({ path: path.join(dir, "fixture.js") });
    await page.getByText("Banco de horas", { exact: true }).first().waitFor();
    await page.screenshot({ path: path.join(dir, `${width}.png`), fullPage: true });
    const geometry = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      documentHeight: document.documentElement.scrollHeight,
      sidebar: (() => {
        const el = document.querySelector('aside[aria-label="Coordinación"]');
        const r = el.getBoundingClientRect();
        return {
          top: r.top,
          bottom: r.bottom,
          height: r.height,
          visible: getComputedStyle(el).display !== "none",
        };
      })(),
      headerHeight: getComputedStyle(document.documentElement).getPropertyValue(
        "--workflow-header-height",
      ),
      details: Array.from(document.querySelectorAll("details")).filter((el) => el.open).length,
    }));
    checks.push({ viewport: width, ...geometry });
    if (geometry.overflow) throw Error(`Horizontal overflow at ${width}`);
    if (width === 1280 && geometry.sidebar.bottom > height + 1)
      throw Error("Sidebar unnecessarily exceeds the desktop viewport");
    if (geometry.details !== 0) throw Error("Optional disclosures must be closed initially");
    if (width === 390) {
      await page.getByRole("button", { name: "Abrir navegación de coordinación" }).click();
      await page.getByRole("dialog").waitFor();
      await page.screenshot({ path: path.join(dir, "mobile-navigation.png") });
    }
  }
  if (errors.length) throw Error(errors.join("\n"));
  console.log(JSON.stringify({ checks, screenshots: dir }));
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
  });
