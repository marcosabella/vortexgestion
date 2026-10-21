// Verifica los archivos publicados; no accede a sesiones ni datos de clientes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const origin = 'https://vortexgestion.netlify.app';
const htmlResponse = await fetch(`${origin}/productos?verify=${Date.now()}`, { signal: AbortSignal.timeout(20000) });
assert.equal(htmlResponse.status, 200);
const html = await htmlResponse.text();
const localHtml = readFileSync('dist/index.html', 'utf8');
const assets = [...localHtml.matchAll(/(?:src|href)="(\/assets\/[^" ]+)"/g)].map(match => match[1]);
assert.ok(assets.length > 0);
const digest = data => createHash('sha256').update(data).digest('hex');
for (const asset of assets) {
  assert.ok(html.includes(asset), `Build actual publicado: ${asset}`);
  const response = await fetch(origin + asset, { signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, 200, asset);
  assert.equal(digest(Buffer.from(await response.arrayBuffer())), digest(readFileSync(`dist${asset}`)), asset);
}
console.log(`OK producción: /productos responde y los ${assets.length} assets principales coinciden por SHA-256 con el build verificado.`);
