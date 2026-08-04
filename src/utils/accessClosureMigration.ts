import type { AccessRow } from "@/utils/accessMigrationPreview";
const v=(r:AccessRow,n:string)=>Object.entries(r).find(([k])=>k.toLowerCase()===n.toLowerCase())?.[1];
const s=(x:unknown)=>x==null?"":String(x).trim();
const n=(x:unknown)=>Number(s(x).replace(",","."))||0;
const d=(x:unknown)=>{if(x instanceof Date)return new Date(Date.UTC(x.getUTCFullYear(),x.getUTCMonth(),x.getUTCDate(),3)).toISOString();const m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s(x));return m?new Date(Date.UTC(+m[3],+m[2]-1,+m[1],3)).toISOString():null;};
export type ClosurePayload={presupuestos:any[];items:any[];archivo:any[]};
export function buildClosurePayload(t:Record<string,AccessRow[]>):ClosurePayload{
 const sales=(t.Ventas||[]).filter(r=>s(v(r,"idComprobante"))==="333");const ids=new Set(sales.map(r=>s(v(r,"idVenta"))));
 const presupuestos=sales.map(r=>({sourceId:s(v(r,"idVenta")),data:{fecha:d(v(r,"fecha_venta")),cliente_source_id:s(v(r,"idCliente")),total:n(v(r,"monto")),descuento:n(v(r,"descuento_venta")),recargo:n(v(r,"recargo_venta")),observaciones:s(v(r,"observaciones"))||null}}));
 const items=(t.Detalle_Venta||[]).filter(r=>ids.has(s(v(r,"idVenta")))).map(r=>({sourceId:s(v(r,"IdDetalle_venta")),data:{presupuesto_source_id:s(v(r,"idVenta")),producto_source_id:s(v(r,"idArticulo")),cantidad:n(v(r,"cantidad")),precio:n(v(r,"precioUnitario"))}}));
 const archive=(table:string,id:string,rows:AccessRow[])=>rows.map(r=>({tipo:table,sourceId:s(v(r,id)),fecha:d(v(r,"fecha"))||d(v(r,"fecha_pago"))||d(v(r,"fechaComprobante")),data:r}));
 const users=(t.Usuarios||[]).map(r=>({tipo:"Usuarios",sourceId:s(v(r,"idUsuario")),fecha:null,data:{nombre:v(r,"nombre"),usuarioSistema:v(r,"usuarioSistema"),clientes:v(r,"clientes"),proveedores:v(r,"proveedores"),productos:v(r,"productos"),ventas:v(r,"ventas"),listaPrecios:v(r,"listaPrecios"),configuracion:v(r,"configuracion"),ctacte:v(r,"ctacte"),listados:v(r,"listados")}}));
 return {presupuestos,items,archivo:[...archive("CompraProveedor","idCompraProveedores",t.CompraProveedor||[]),...archive("PagosProveedores","idPago",t.PagosProveedores||[]),...archive("TempCtaCte","Id",t.TempCtaCte||[]),...archive("CotizacionDolar","Id",t.CotizacionDolar||[]),...users]};
}
