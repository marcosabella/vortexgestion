import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/utils/compartirWhatsApp.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const file = { name: "factura.pdf", type: "application/pdf" };
const data = { files: [file], title: "Factura", text: "Comprobante" };
const chat = "https://wa.me/5491112345678?text=Comprobante";

function setup(navigator = {}) {
  const events = [];
  const timers = [];
  const context = vm.createContext({
    exports: {}, navigator, DOMException,
    window: {
      open: (...args) => events.push(["open", ...args]),
      setTimeout: (callback) => timers.push(callback),
    },
    URL: {
      createObjectURL: (value) => { assert.equal(value, file); return "blob:pdf"; },
      revokeObjectURL: () => events.push(["revoke"]),
    },
    document: {
      body: { appendChild: () => {} },
      createElement: () => ({ click: () => events.push(["download"]), remove: () => {} }),
    },
  });
  vm.runInContext(code, context);
  return { share: context.exports.compartirPdfWhatsApp, events, timers };
}

// Compartir debe iniciarse dentro del clic, sin esperar otro trabajo asincrono.
let invoked = false;
let app = setup({ canShare: (value) => value.files[0] === file, share: (value) => { invoked = true; assert.equal(value, data); return Promise.resolve(); } });
let result = app.share(data, chat);
assert.equal(invoked, true);
assert.equal(await result, "compartido");
assert.equal(app.events.length, 0);

// Sin soporte de archivos, abrir el chat tambien debe ser inmediato.
for (const navigator of [{}, { canShare: () => false, share: () => assert.fail("No debe compartir") }]) {
  app = setup(navigator);
  result = app.share(data, chat);
  assert.equal(app.events[0][0], "open");
  assert.equal(app.events[0][1], chat);
  assert.equal(app.events[1][0], "download");
  assert.equal(await result, "descargado");
  assert.equal(app.events.length, 2);
  app.timers[0]();
  assert.equal(app.events[2][0], "revoke");
}

// Cancelar nunca debe iniciar un envio alternativo ni una descarga.
app = setup({ canShare: () => true, share: () => Promise.reject(new DOMException("Cancelado", "AbortError")) });
assert.equal(await app.share(data, chat), "cancelado");
assert.equal(app.events.length, 0);

// Si compartir consume la activacion, esperar un nuevo clic para abrir el chat.
app = setup({ canShare: () => true, share: () => Promise.reject(new DOMException("Bloqueado", "NotAllowedError")) });
await assert.rejects(app.share(data, chat), { name: "NotAllowedError" });
assert.equal(app.events.length, 0);
result = app.share(data, chat, true);
assert.equal(app.events[0][0], "open");
assert.equal(await result, "descargado");

console.log("WhatsApp: compartir inmediato, alternativa sin soporte, cancelacion y recuperacion verificados.");
