const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const esbuild = require("esbuild");
const { chromium } = require(process.argv[2] || "playwright");
const repo = path.resolve(__dirname, "../..");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-picker-"));
let browser, server;
async function main() {
  await esbuild.build({
    stdin: {
      resolveDir: repo,
      loader: "jsx",
      contents: `
      import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
      import {CompensatoryAgentInput} from '@/components/CompensatoryAgentInput';
      const options=Array.from({length:48},(_,i)=>({id:'staff'+i,label:(i<2?'Pérez Ana':'Gómez Persona '+i)+' · DNI '+(12000000+i)}));
      function App(){const[value,setValue]=useState('staff0');const[disabled,setDisabled]=useState(false);window.setDisabled=setDisabled;
        return <><CompensatoryAgentInput id='picker' label='Enfermeros' options={options} value={value} disabled={disabled} onSelect={id=>{setValue(id??'');window.selected=id}}/><button id='outside' style={{position:'fixed',right:8,top:8}}>Fuera</button></>};
      createRoot(document.getElementById('root')).render(<App/>);`,
    },
    outfile: path.join(dir, "app.js"),
    bundle: true,
    platform: "browser",
    jsx: "automatic",
    alias: { "@": path.join(repo, "src") },
    logLevel: "silent",
  });
  server = http.createServer((_, res) => res.end('<html><div id="root"></div></html>'));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  browser = await chromium.launch({ headless: true, channel: "msedge" });
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.addScriptTag({ path: path.join(dir, "app.js") });
  const check = (ok, name) => {
    if (!ok) throw Error(name);
    console.log(`PASS: ${name}`);
  };
  const input = page.locator("#picker");
  await page.getByRole("button", { name: "Mostrar opciones de Enfermeros" }).click();
  check(
    (await page.getByRole("option").count()) === 48,
    "explicit arrow opens all 48 options despite an initial selected full name",
  );
  await input.fill("perez");
  check(
    (await page.getByRole("option").count()) === 2,
    "surname search ignores accents and distinguishes same-name DNI options",
  );
  check(
    (await page.evaluate(() => window.selected)) === null,
    "partial search clears the old selected ID",
  );
  await input.press("ArrowDown");
  await input.press("ArrowDown");
  await input.press("Enter");
  check(
    (await page.evaluate(() => window.selected)) === "staff1",
    "keyboard selects the exact ID of the second matching nurse",
  );
  check((await page.getByRole("listbox").count()) === 0, "selection closes the list");
  await page.getByRole("button", { name: "Mostrar opciones de Enfermeros" }).click();
  check(
    (await page.getByRole("option").count()) === 48,
    "reopening after selection restores the complete list",
  );
  await input.press("ArrowUp");
  await input.press("Enter");
  check(
    (await page.evaluate(() => window.selected)) === "staff47",
    "ArrowUp from an unhighlighted list selects the last available option",
  );
  await page.getByRole("button", { name: "Mostrar opciones de Enfermeros" }).click();
  await input.fill("sin coincidencias");
  await page.getByText("No se encontraron agentes.", { exact: true }).waitFor();
  check(
    (await page.getByRole("option").count()) === 0,
    "unknown text does not invent a selectable person",
  );
  await input.press("Escape");
  check((await page.getByRole("listbox").count()) === 0, "Escape closes without selecting");
  await page.getByRole("button", { name: "Mostrar opciones de Enfermeros" }).click();
  await page.getByRole("option").filter({ hasText: "12000000" }).click();
  check(
    (await page.evaluate(() => window.selected)) === "staff0",
    "pointer chooses the intended nurse",
  );
  await page.getByRole("button", { name: "Mostrar opciones de Enfermeros" }).click();
  await page.locator("#outside").click();
  check((await page.getByRole("listbox").count()) === 0, "outside focus dismisses the list");
  await page.evaluate(() => window.setDisabled(true));
  check(
    (await input.isDisabled()) &&
      (await page.getByRole("button", { name: "Mostrar opciones de Enfermeros" }).isDisabled()),
    "saving can disable input and dropdown trigger together",
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
