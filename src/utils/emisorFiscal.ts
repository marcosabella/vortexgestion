import type { EmisorFiscal } from "@/types/emisorFiscal";
import type { Venta } from "@/types/venta";
import type { Comercio } from "@/types/comercio";
import type { AfipConfig } from "@/types/afip";

export const emisorFiscalLabel = (emisor: Pick<EmisorFiscal, "razon_social" | "cuit_emisor">) => `${emisor.razon_social} — ${emisor.cuit_emisor}`;

export function configEmisorFiscal(emisor: EmisorFiscal): AfipConfig {
  return { id: emisor.id, comercio_id: emisor.comercio_id, punto_venta: emisor.punto_venta, cuit_emisor: emisor.cuit_emisor, ambiente: emisor.ambiente, activo: emisor.activo, certificado_vencimiento: emisor.certificado_vencimiento, tiene_certificados: emisor.tiene_certificados };
}

export function datosFiscalesVenta(venta: Venta, comercio?: Comercio | null, config?: AfipConfig | null) {
  const snapshot = venta.emisor_snapshot;
  if (!snapshot) return { comercio, afipConfig: config };
  return {
    comercio: comercio ? { ...comercio, nombre_comercio: snapshot.razon_social, cuit: snapshot.cuit_emisor, situacion_afip: snapshot.situacion_afip, calle: snapshot.domicilio, numero: "", localidad: snapshot.localidad, provincia: snapshot.provincia, ingresos_brutos: snapshot.ingresos_brutos, fecha_inicio_actividad: snapshot.fecha_inicio_actividad || undefined } : comercio,
    afipConfig: { id: snapshot.id, punto_venta: venta.punto_venta || snapshot.punto_venta, cuit_emisor: snapshot.cuit_emisor, ambiente: snapshot.ambiente, activo: true } as AfipConfig,
  };
}
