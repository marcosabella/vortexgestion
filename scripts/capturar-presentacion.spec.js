import { test } from '@playwright/test';
import fs from 'node:fs';

const baseURL = 'http://127.0.0.1:5173';
const outputDir = 'public/capturas-presentacion';

test('capturar pantallas comerciales', async ({ page }) => {
  fs.mkdirSync(outputDir, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto(`${baseURL}/login`, { waitUntil: 'networkidle' });
  await page.locator('#email').fill(process.env.DEMO_EMAIL);
  await page.locator('#password').fill(process.env.DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 30000 });

  const routes = [
    ['01-caja', '/caja', 'Caja Diaria'],
    ['02-ventas', '/ventas', 'Gestión de Ventas'],
    ['03-productos', '/productos', 'Gestión de Productos'],
    ['04-cuenta-corriente', '/cuenta-corriente', 'Cuenta Corriente'],
    ['05-reporte-ventas', '/listados/ventas', 'Reporte de Ventas'],
    ['06-reporte-productos', '/listados/productos', 'Reporte de Productos'],
  ];

  for (const [name, route, heading] of routes) {
    await page.goto(`${baseURL}${route}`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: heading }).first().waitFor({ timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${outputDir}/${name}.jpg`, type: 'jpeg', quality: 88, fullPage: false });
  }
});
