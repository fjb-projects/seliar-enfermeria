const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const esbuild = require("esbuild");
const { chromium } = require(process.argv[2] || "playwright");
const root = path.resolve(__dirname, "../..");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "request-mapper-"));
const file = path.join(dir, "fixture.js");
let browser, server;
function exportJson(count = 3) {
  return JSON.stringify({
    schemaVersion: 1,
    exportedAt: "2026-10-28T10:00:00Z",
    source: { kind: "google-forms", formId: "fake" },
    responseCount: count,
    responses: Array.from({ length: count }, (_, i) => ({
      responseId: `r${i}`,
      submittedAt: "2026-10-01T12:00:00Z",
      answers: Object.entries({
        requesterName: "Synthetic Alpha",
        requesterMobile: "Ambulance 1",
        compensatoryDate: "2026-11-01",
        hours: "2",
        requesterEmail: "reviewed@example.test",
      }).map(([field, value]) => ({ field, value, itemId: field, itemType: "TEXT" })),
    })),
  });
}
async function main() {
  await esbuild.build({
    stdin: {
      contents: `
    import React, {useState} from 'react'; import {createRoot} from 'react-dom/client';
    import {CompensatorySourceReview} from '@/components/CompensatorySourceReview';
    window.probe={calls:[],copies:[],mode:'error'};
    const agents=[{id:'agent-a',dni:'12345678',name:'Synthetic Alpha',email:null},
      {id:'agent-b',dni:'23456789',name:'Synthetic Beta',email:'old@example.test'}];
    function App(){const [targets,setTargets]=useState(agents);window.replaceTargets=setTargets;
      return <CompensatorySourceReview staffTargets={targets}
        onCopyRequesterEmail={async(id,email)=>{window.probe.copies.push({id,email})}}
        onSaveRequest={async(id,request,confirmed,responseId)=>{
          window.probe.calls.push({id,request,confirmed,responseId});
          if(window.probe.mode==='error')throw Error('Synthetic save failure');
          if(window.probe.mode==='pause')await new Promise(resolve=>window.resume=resolve);
          if(window.probe.mode==='duplicate'&&!confirmed)return {status:'duplicate_review_required',matches:[{id:'existing',...request}]};
          return {status:'stored',request:{id:'saved'}};
        }}/>} createRoot(document.getElementById('root')).render(<App/>);`,
      resolveDir: root,
      loader: "jsx",
    },
    outfile: file,
    bundle: true,
    platform: "browser",
    jsx: "automatic",
    alias: { "@": path.join(root, "src") },
    nodePaths: [path.join(root, "node_modules")],
    logLevel: "silent",
  });
  server = http.createServer((_, res) => res.end('<html><div id="root"></div></html>'));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  browser = await chromium.launch({ headless: true, channel: "msedge" });
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.addScriptTag({ path: file });
  const check = (value, message) => {
    if (!value) throw Error(message);
    console.log("PASS: " + message);
  };
  const upload = async (count) =>
    page
      .locator("#source-requests")
      .setInputFiles({
        name: "synthetic.json",
        mimeType: "application/json",
        buffer: Buffer.from(exportJson(count)),
      });
  const card = (id) => page.locator("article").filter({ has: page.locator(`#target-${id}`) });
  await upload(3);
  const first = card("r0");
  await page.locator("#target-r0").selectOption({ label: "Synthetic Alpha · DNI 12345678" });
  check(
    await first.getByRole("button", { name: "Vincular y guardar", exact: true }).isEnabled(),
    "JSON maps directly to saved agents without CSV",
  );
  check(
    (await page.evaluate(() => window.probe.calls.length)) === 0,
    "choosing a suggested agent does not auto-save",
  );
  await first.getByRole("button", { name: "Vincular y guardar", exact: true }).click();
  await page.getByText("Synthetic save failure", { exact: true }).waitFor();
  check(
    await page.getByText("Synthetic save failure", { exact: true }).isVisible(),
    "failed save stays visible for retry",
  );
  await page.evaluate(() => {
    window.probe.mode = "pause";
  });
  await page.getByRole("button", { name: "Vincular y guardar", exact: true }).first().click();
  await page.waitForFunction(() => Boolean(window.resume));
  check(
    await page.locator("#source-requests").isDisabled(),
    "in-flight save blocks file replacement",
  );
  await page.evaluate(() => window.resume());
  await page.waitForFunction(() => document.querySelectorAll("article").length === 2);
  check(
    (await page.locator("article").count()) === 2,
    "stored request disappears from pending after confirmation",
  );
  check(
    (await page.evaluate(() => window.probe.calls[0].id)) === "agent-a",
    "saved association uses the selected database ID",
  );
  await page.locator("#target-r1").selectOption({ label: "Synthetic Beta · DNI 23456789" });
  await page.getByRole("button", { name: "Copiar correo revisado al perfil" }).click();
  await page.waitForFunction(() => window.probe.copies.length === 1);
  check(
    (await page.evaluate(() => window.probe.copies[0].id)) === "agent-b",
    "email remains an explicit action for the selected agent",
  );
  await page.evaluate(() => {
    window.probe.mode = "duplicate";
  });
  await card("r1").getByRole("button", { name: "Vincular y guardar", exact: true }).click();
  await page.getByRole("button", { name: "Guardar igualmente tras revisar" }).waitFor();
  check(
    (await page.locator("article").count()) === 2,
    "duplicate review does not discard the card",
  );
  await page.getByRole("button", { name: "Guardar igualmente tras revisar" }).click();
  await page.waitForFunction(() => document.querySelectorAll("article").length === 1);
  check(
    (await page.locator("article").count()) === 1,
    "explicit duplicate confirmation removes only the saved card",
  );
  await page.evaluate(() => window.replaceTargets([]));
  check(
    await page.locator("#target-r2").isDisabled(),
    "empty saved directory cannot create an association",
  );
  await page.evaluate(() => {
    window.replaceTargets([
      { id: "agent-a", dni: "12345678", name: "Synthetic Alpha", email: null },
    ]);
    window.probe.mode = "stored";
  });
  await upload(26);
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();
  await page.locator("#target-r25").selectOption("12345678");
  await card("r25").getByRole("button", { name: "Vincular y guardar", exact: true }).click();
  await page.locator("#target-r0").waitFor();
  check(
    (await page.locator("article").count()) === 25,
    "saving the last card clamps pagination to a nonempty pending page",
  );
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
