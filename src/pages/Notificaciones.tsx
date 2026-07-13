import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell, Check, ReceiptText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { categoriaLabels, Notificacion, prioridadLabels, useNotificaciones } from "@/hooks/useNotificaciones";
import { useComercio } from "@/hooks/useComercio";
import { useAfipConfig } from "@/hooks/useAfipConfig";
import { supabase } from "@/integrations/supabase/client";
import { Venta, getVentaTotalFinal } from "@/types/venta";
import { generarQRAfip } from "@/utils/afipQr";
import { buildFacturaPrintHtml } from "@/utils/facturaPrint";
import { FacturaImpresion } from "@/components/FacturaImpresion";

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
});

const moneyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
});

function formatDate(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : "-";
}

function ComprobanteView({ notificacion }: { notificacion: Notificacion }) {
  const { comercio } = useComercio();
  const { data: afipConfig } = useAfipConfig();
  const [qrDataUrl, setQrDataUrl] = useState("");
  const ventaQuery = useQuery({
    queryKey: ["notificacion-venta", comercio?.id, notificacion.comprobante_numero],
    enabled: Boolean(comercio?.id && notificacion.comprobante_numero),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ventas")
        .select(`
          *,
          cliente:clientes(nombre, apellido, cuit, calle, numero, codigo_postal, localidad, provincia, telefono, situacion_afip, tipo_persona),
          banco:bancos(nombre_banco, numero_cuenta),
          tarjeta:tarjetas_credito(nombre),
          venta_items(*, producto:productos(cod_producto, descripcion, precio_venta, porcentaje_iva)),
          pagos_venta(*, banco:bancos(nombre_banco), tarjeta:tarjetas_credito(nombre), cheque:cheques(numero_cheque, monto, banco_emisor))
        `)
        .eq("comercio_id", comercio!.id)
        .eq("numero_comprobante", notificacion.comprobante_numero!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as Venta | null;
    },
  });

  const venta = ventaQuery.data;

  useEffect(() => {
    let active = true;
    setQrDataUrl("");

    if (!venta?.cae?.trim() || !comercio || !afipConfig) return () => { active = false; };

    generarQRAfip({
      fecha: venta.fecha_venta,
      cuit: comercio.cuit,
      puntoVenta: afipConfig.punto_venta,
      tipoComprobante: venta.tipo_comprobante,
      numeroComprobante: venta.numero_comprobante,
      importe: getVentaTotalFinal(venta),
      cae: venta.cae,
    }).then((qr) => {
      if (active) setQrDataUrl(qr);
    }).catch((error) => console.error("Error generando QR ARCA:", error));

    return () => { active = false; };
  }, [venta, comercio, afipConfig]);

  const comprobanteHtml = useMemo(
    () => venta ? buildFacturaPrintHtml({ venta, comercio, afipConfig, qrDataUrl }) : "",
    [venta, comercio, afipConfig, qrDataUrl],
  );

  if (ventaQuery.isLoading) {
    return <div className="py-10 text-center text-sm text-muted-foreground">Cargando comprobante de venta...</div>;
  }

  if (ventaQuery.error) {
    return <div className="py-10 text-center text-sm text-destructive">No se pudo cargar el comprobante.</div>;
  }

  if (venta) {
    return (
      <div className="space-y-4">
        <iframe
          title={`Comprobante ${venta.numero_comprobante}`}
          srcDoc={comprobanteHtml}
          className="h-[70vh] w-full rounded-md border bg-white"
        />
        <div className="flex flex-wrap gap-2">
          <FacturaImpresion venta={venta} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-md border p-5 print:border-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">
              {notificacion.categoria === "comprobante" ? "Comprobante de venta" : "Comprobante de abono"}
            </p>
            <h3 className="text-2xl font-bold">{notificacion.comprobante_numero || "Sin numero"}</h3>
          </div>
          <Badge variant="outline">{notificacion.comprobante_periodo || "Periodo no informado"}</Badge>
        </div>

        <Separator className="my-5" />

        <div className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-muted-foreground">Comercio</p>
            <p className="font-medium">{comercio?.nombre_comercio || "-"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Fecha</p>
            <p className="font-medium">{notificacion.comprobante_fecha || "-"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Importe</p>
            <p className="font-medium">
              {notificacion.comprobante_monto !== null ? moneyFormatter.format(notificacion.comprobante_monto) : "-"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Estado</p>
            <p className="font-medium">Informado</p>
          </div>
        </div>

        <Separator className="my-5" />

        <p className="whitespace-pre-line text-sm">{notificacion.mensaje}</p>
      </div>

      <p className="text-sm text-muted-foreground">
        No se encontro una venta de este comercio con ese numero de comprobante.
      </p>
    </div>
  );
}

function NotificacionItem({
  notificacion,
  onOpen,
}: {
  notificacion: Notificacion;
  onOpen: (id: string) => void;
}) {
  const hasComprobante = Boolean(notificacion.comprobante_numero || notificacion.comprobante_monto);

  return (
    <Card className={notificacion.leida ? "" : "border-primary/50 bg-primary/5"}>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              {!notificacion.leida && <span className="h-2 w-2 rounded-full bg-primary" />}
              {notificacion.titulo}
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{categoriaLabels[notificacion.categoria]}</Badge>
              <Badge variant={notificacion.prioridad === "alta" ? "destructive" : "outline"}>
                {prioridadLabels[notificacion.prioridad]}
              </Badge>
              <span className="text-xs text-muted-foreground">{formatDate(notificacion.created_at)}</span>
            </div>
          </div>
          {!notificacion.leida && (
            <Button type="button" variant="outline" size="sm" onClick={() => onOpen(notificacion.id)}>
              <Check className="h-4 w-4" />
              Marcar leida
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="whitespace-pre-line text-sm">{notificacion.mensaje}</p>

        {hasComprobante && (
          <Dialog onOpenChange={(open) => open && onOpen(notificacion.id)}>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                <ReceiptText className="h-4 w-4" />
                Ver comprobante
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-5xl">
              <DialogHeader>
                <DialogTitle>Comprobante</DialogTitle>
              </DialogHeader>
              <ComprobanteView notificacion={notificacion} />
            </DialogContent>
          </Dialog>
        )}
      </CardContent>
    </Card>
  );
}

export default function Notificaciones() {
  const { notificacionesQuery, notificaciones, noLeidas, marcarLeida } = useNotificaciones();

  return (
    <div className="container mx-auto max-w-5xl space-y-6 p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Notificaciones</h1>
          <p className="text-sm text-muted-foreground">Avisos enviados por la administracion del sistema.</p>
        </div>
        <Badge variant={noLeidas > 0 ? "default" : "secondary"} className="w-fit gap-2">
          <Bell className="h-3 w-3" />
          {noLeidas} sin leer
        </Badge>
      </div>

      {notificacionesQuery.isLoading ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">Cargando notificaciones...</CardContent>
        </Card>
      ) : notificaciones.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">No hay notificaciones disponibles.</CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {notificaciones.map((notificacion) => (
            <NotificacionItem
              key={notificacion.id}
              notificacion={notificacion}
              onOpen={(id) => marcarLeida.mutate(id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
