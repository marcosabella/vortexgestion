import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bell, CheckCircle2, ChevronDown, ChevronUp, CreditCard, Eye, Loader2, ReceiptText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { categoriaLabels, Notificacion, prioridadLabels, useNotificaciones } from "@/hooks/useNotificaciones";
import { useComercio } from "@/hooks/useComercio";
import { supabase } from "@/integrations/supabase/client";
import { Venta, getVentaTotalFinal } from "@/types/venta";
import type { Comercio } from "@/types/comercio";
import type { AfipConfig } from "@/types/afip";
import type { FormatoComprobante } from "@/config/parametrizacion";
import { generarQRAfip } from "@/utils/afipQr";
import { buildFacturaPrintHtml } from "@/utils/facturaPrint";
import { FacturaImpresion } from "@/components/FacturaImpresion";
import { useToast } from "@/hooks/use-toast";

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

function getMetadata(notificacion: Notificacion) {
  const metadata = notificacion.metadata;
  return typeof metadata === "object" && metadata !== null && !Array.isArray(metadata)
    ? metadata
    : {};
}

function ComprobanteView({ notificacion }: { notificacion: Notificacion }) {
  const { comercio } = useComercio();
  const [qrDataUrl, setQrDataUrl] = useState("");
  const metadata = getMetadata(notificacion);
  const tieneReferenciaOriginal = typeof metadata.venta_id === "string"
    && typeof metadata.comercio_emisor_id === "string";
  const ventaQuery = useQuery({
    queryKey: ["notificacion-comprobante-original", comercio?.id, notificacion.id],
    enabled: Boolean(comercio?.id && tieneReferenciaOriginal),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_comprobante_notificacion", {
        p_notificacion_id: notificacion.id,
        p_comercio_id: comercio!.id,
      });

      if (error) throw error;
      return data as unknown as {
        venta: Venta;
        comercio: Comercio;
        afip_config: AfipConfig | null;
        formato: FormatoComprobante;
      } | null;
    },
  });

  const venta = ventaQuery.data?.venta;
  const comercioEmisor = ventaQuery.data?.comercio;
  const afipConfigEmisor = ventaQuery.data?.afip_config;
  const formatoEmisor = ventaQuery.data?.formato;

  useEffect(() => {
    let active = true;
    setQrDataUrl("");

    if (!venta?.cae?.trim() || !comercioEmisor || !afipConfigEmisor) return () => { active = false; };

    generarQRAfip({
      fecha: venta.fecha_venta,
      cuit: comercioEmisor.cuit,
      puntoVenta: afipConfigEmisor.punto_venta,
      tipoComprobante: venta.tipo_comprobante,
      numeroComprobante: venta.numero_comprobante,
      importe: getVentaTotalFinal(venta),
      cae: venta.cae,
    }).then((qr) => {
      if (active) setQrDataUrl(qr);
    }).catch((error) => console.error("Error generando QR ARCA:", error));

    return () => { active = false; };
  }, [venta, comercioEmisor, afipConfigEmisor]);

  const comprobanteHtml = useMemo(
    () => venta
      ? buildFacturaPrintHtml({
          venta,
          comercio: comercioEmisor,
          afipConfig: afipConfigEmisor,
          qrDataUrl,
          formato: formatoEmisor,
        })
      : "",
    [venta, comercioEmisor, afipConfigEmisor, qrDataUrl, formatoEmisor],
  );

  if (tieneReferenciaOriginal && ventaQuery.isLoading) {
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
          <FacturaImpresion
            venta={venta}
            comercioOverride={comercioEmisor}
            afipConfigOverride={afipConfigEmisor}
            formatoOverride={formatoEmisor}
          />
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
        {tieneReferenciaOriginal
          ? "No se pudo recuperar el comprobante original compartido por la administracion."
          : "Esta notificacion no tiene asociado un comprobante de venta imprimible."}
      </p>
    </div>
  );
}

function NotificacionItem({
  notificacion,
  expanded,
  onToggle,
}: {
  notificacion: Notificacion;
  expanded: boolean;
  onToggle: (notificacion: Notificacion) => void;
}) {
  const { comercio } = useComercio();
  const { toast } = useToast();
  const hasComprobante = Boolean(notificacion.comprobante_numero || notificacion.comprobante_monto);
  const metadata = getMetadata(notificacion);
  const admiteMercadoPago = metadata.tipo === "membresia_pago"
    && metadata.mercadopago_habilitado === true
    && Boolean(notificacion.comprobante_monto && notificacion.comprobante_monto > 0);
  const pagoQuery = useQuery({
    queryKey: ["pago-membresia-mercadopago", notificacion.id, comercio?.id],
    enabled: admiteMercadoPago && Boolean(comercio?.id),
    refetchInterval: (query) => {
      const estado = query.state.data?.estado;
      return estado === "pendiente" || estado === "procesando" ? 5_000 : false;
    },
    queryFn: async () => {
      const { data, error } = await supabase
        .from("membresia_pagos_mercadopago")
        .select("id,estado,checkout_url,approved_at")
        .eq("notificacion_id", notificacion.id)
        .eq("comercio_id", comercio!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const iniciarPago = useMutation({
    mutationFn: async () => {
      if (!comercio?.id) throw new Error("No se pudo resolver el comercio actual");
      const { data, error } = await supabase.functions.invoke("membresia-checkout", {
        body: {
          notificacionId: notificacion.id,
          comercioId: comercio.id,
          returnOrigin: window.location.origin,
        },
      });
      if (error) throw error;
      if (data?.estado === "aprobado") return data;
      if (!data?.checkoutUrl) throw new Error(data?.error || "Mercado Pago no devolvio el enlace de pago");
      window.location.assign(data.checkoutUrl);
      return data;
    },
    onSuccess: (data) => {
      if (data?.estado === "aprobado") {
        void pagoQuery.refetch();
        toast({ title: "Pago confirmado", description: "Este comprobante ya fue pagado." });
      }
    },
    onError: (error: Error) => {
      toast({ title: "No se pudo iniciar el pago", description: error.message, variant: "destructive" });
    },
  });
  const pagoAprobado = pagoQuery.data?.estado === "aprobado";

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
          <Button
            type="button"
            variant={notificacion.leida ? "outline" : "default"}
            size="sm"
            onClick={() => onToggle(notificacion)}
            aria-expanded={expanded}
            aria-controls={`notificacion-${notificacion.id}`}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {expanded ? "Ocultar notificación" : notificacion.leida ? "Volver a leer" : "Leer notificación"}
            {!expanded && <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent id={`notificacion-${notificacion.id}`} className="space-y-4 border-t pt-4">
          <p className="whitespace-pre-line text-sm leading-6">{notificacion.mensaje}</p>

          {hasComprobante && (
            <Dialog>
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

          {admiteMercadoPago && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border bg-background p-3">
              {pagoAprobado ? (
                <Badge className="gap-2 bg-green-600 hover:bg-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  Pagado con Mercado Pago
                </Badge>
              ) : (
                <Button
                  type="button"
                  variant="success"
                  size="sm"
                  disabled={iniciarPago.isPending || pagoQuery.isLoading}
                  onClick={() => iniciarPago.mutate()}
                >
                  {iniciarPago.isPending || pagoQuery.isLoading
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <CreditCard className="h-4 w-4" />}
                  {pagoQuery.data?.estado === "pendiente" ? "Continuar pago con Mercado Pago" : "Pagar con Mercado Pago"}
                </Button>
              )}
              {!pagoAprobado && (
                <p className="text-xs text-muted-foreground">
                  Sera redirigido al sitio seguro de Mercado Pago.
                </p>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default function Notificaciones() {
  const { notificacionesQuery, notificaciones, noLeidas, marcarLeida } = useNotificaciones();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleNotificacion = (notificacion: Notificacion) => {
    if (expandedId === notificacion.id) {
      setExpandedId(null);
      return;
    }

    setExpandedId(notificacion.id);
    if (!notificacion.leida) marcarLeida.mutate(notificacion.id);
  };

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
              expanded={expandedId === notificacion.id}
              onToggle={toggleNotificacion}
            />
          ))}
        </div>
      )}
    </div>
  );
}
