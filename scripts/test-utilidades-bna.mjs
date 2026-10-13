import assert from "node:assert/strict";
import { parsearBilletesBna, consultarBilletesBna, BNA_FUENTE } from "../netlify/functions/lib/bna.mjs";
import handler from "../netlify/functions/cotizaciones-bna.mjs";
const fixture = '<div id="billetes"><table><thead><tr><th>13/10/2026</th><th>Compra</th><th>Venta</th></tr></thead><tbody><tr><td>Dolar U.S.A</td><td>1485,00</td><td>1535,00</td></tr><tr><td>Euro</td><td>1655,00</td><td>1765,00</td></tr><tr><td>Real *</td><td>28600,00</td><td>31600,00</td></tr></tbody></table><div>Hora Actualización: 09:55</div><div>(*) cotización cada 100 unidades.</div></div><div id="divisas"><table><tr><td>Dolar U.S.A</td><td>1508.0000</td><td>1517.0000</td></tr></table></div>';
const data=parsearBilletesBna(fixture);
assert.equal(data.fecha,"2026-10-13");assert.equal(data.hora,"09:55");
assert.deepEqual(data.detalle.map(item=>item.codigoMoneda),["USD","BRL","EUR"]);
assert.equal(data.detalle[0].venta,1535);assert.equal(data.detalle[1].unidades,100);assert.equal(data.detalle[1].venta,31600);
assert.equal(parsearBilletesBna(fixture.replace("1485,00","1.485,00")).detalle[0].compra,1485);
for (const invalid of [fixture.replace('id="billetes"','id="otro"'),fixture.replace("Compra","Venta"),fixture.replace("1535,00","NaN"),fixture.replace("1535,00","1400,00"),fixture.replace("cotización cada 100 unidades","unidad desconocida"),fixture.replace("13/10/2026","31/02/2026"),fixture.replace("09:55","25:99"),fixture.replace("Euro","Otra moneda")]) assert.throws(()=>parsearBilletesBna(invalid));
let called;
await consultarBilletesBna(async (url, options)=>{called={url,options};return new Response(fixture);});
assert.equal(called.url,BNA_FUENTE);assert.equal(called.options.redirect,"error");assert(called.options.signal);
await assert.rejects(()=>consultarBilletesBna(async()=>new Response("",{status:503})));
const realFetch=globalThis.fetch;
try {
  globalThis.fetch=async()=>new Response(fixture);
  let response=await handler(new Request("http://localhost/.netlify/functions/cotizaciones-bna"));
  assert.equal(response.status,200);assert.equal((await response.json()).detalle[0].venta,1535);assert.match(response.headers.get("cache-control"),/max-age=60/);
  assert.equal((await handler(new Request("http://localhost/api?url=https://otro.test"))).status,400);
  assert.equal((await handler(new Request("http://localhost/api",{method:"POST"}))).status,405);
  globalThis.fetch=async()=>new Response("Sitio cambió");
  response=await handler(new Request("http://localhost/api"));assert.equal(response.status,502);assert.equal(response.headers.get("cache-control"),"no-store");assert(!("detalle" in await response.json()));
} finally {globalThis.fetch=realFetch;}
console.log("OK BNA: billetes separados de divisas, compra/venta, unidades, fechas, formato, destino fijo, errores y caché.");
