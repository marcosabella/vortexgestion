// Esquema mínimo de los comprobantes existentes: prueba la integración económica,
// no sustituye las pruebas transaccionales de Compras/Ventas/Caja.
import { readFileSync } from 'node:fs';
import { idApicola as id } from './apicola-pg.mjs';
export function prepararEconomiaPg(pg) {
  pg.sql(`CREATE TABLE compras(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES comercio(id),numero text NOT NULL,fecha date NOT NULL DEFAULT current_date,estado text NOT NULL DEFAULT 'recibida',total numeric(14,2) NOT NULL DEFAULT 0);
    CREATE TABLE gastos_egresos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),comercio_id uuid NOT NULL REFERENCES comercio(id),fecha date NOT NULL DEFAULT current_date,concepto text NOT NULL,numero_comprobante text,monto numeric(12,2) NOT NULL,estado text DEFAULT 'pagado');
    CREATE TABLE ventas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),comercio_id uuid NOT NULL REFERENCES comercio(id),numero_comprobante text NOT NULL,fecha_venta timestamptz NOT NULL DEFAULT now(),tipo_comprobante text NOT NULL DEFAULT 'factura_a',cliente_nombre text,total numeric(14,2) NOT NULL,moneda text NOT NULL DEFAULT 'ARS',anulado_at timestamptz,comprobante_asociado_id uuid REFERENCES ventas(id));`);
  for (const file of ['20261106150000_apicola_economia_estructura.sql', '20261106150100_apicola_economia_operaciones.sql', '20261106150200_apicola_economia_consultas.sql']) pg.sql(readFileSync(`supabase/migrations/${file}`, 'utf8'));
}
export function sembrarDocumentosEconomicos(pg) {
  pg.sql(`INSERT INTO compras(id,comercio_id,numero,total) VALUES('${id(40)}','${id(10)}','COMPRA-APICOLA',1000);
    INSERT INTO gastos_egresos(id,comercio_id,concepto,numero_comprobante,monto) VALUES('${id(41)}','${id(10)}','Flete compartido','GASTO-APICOLA',400);
    INSERT INTO ventas(id,comercio_id,numero_comprobante,cliente_nombre,total,moneda,fecha_venta) VALUES('${id(42)}','${id(10)}','VENTA-APICOLA','Comprador existente',2000,'ARS',current_date+time '12:00'),('${id(43)}','${id(10)}','VENTA-USD','Comprador existente',250,'USD',current_date+time '12:00');`);
}
