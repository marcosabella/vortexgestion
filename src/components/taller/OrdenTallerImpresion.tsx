import { FacturaImpresion } from '@/components/FacturaImpresion';
import type { Cliente } from '@/types/cliente';
import type { Comercio } from '@/types/comercio';
import type { TallerOrden, TallerVehiculo, TallerItem } from '@/types/taller';
import { crearDocumentoOrdenTaller } from '@/utils/tallerDocumento';

export function OrdenTallerImpresion({ orden, vehiculo, items, cliente, comercio, responsable, showPrint, showPdf }: {
  orden: TallerOrden; vehiculo: TallerVehiculo; items: TallerItem[]; cliente?: Cliente; comercio?: Comercio | null;
  responsable: string; showPrint: boolean; showPdf: boolean;
}) {
  return <FacturaImpresion venta={crearDocumentoOrdenTaller({ orden, vehiculo, items, cliente })}
    documentType="orden_taller" ordenTaller={{ orden, responsable }} comercioOverride={comercio}
    afipConfigOverride={null} showPrint={showPrint} showPdf={showPdf} />;
}
