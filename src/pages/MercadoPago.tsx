import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import {
  CreditCard,
  Link2,
  LocateFixed,
  QrCode,
  RefreshCw,
  Unplug,
} from "lucide-react";
import { useMercadoPago } from "@/hooks/useMercadoPago";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const defaults = {
  ambiente: "test",
  checkout_habilitado: false,
  qr_habilitado: false,
  modo_qr: "dynamic",
  confirmar_pedido_automaticamente: true,
  convertir_pedido_en_venta: false,
  registrar_en_caja: true,
  reservar_stock: true,
  minutos_reserva: 15,
};
const provincias = [
  "Buenos Aires",
  "Ciudad Autónoma de Buenos Aires",
  "Catamarca",
  "Chaco",
  "Chubut",
  "Córdoba",
  "Corrientes",
  "Entre Ríos",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "La Rioja",
  "Mendoza",
  "Misiones",
  "Neuquén",
  "Río Negro",
  "Salta",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santa Fe",
  "Santiago del Estero",
  "Tierra del Fuego",
  "Tucumán",
];
const money = (v: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(
    v || 0,
  );
export default function MercadoPago() {
  const { comercio, status, run, isWorking } = useMercadoPago();
  const data = status.data || {};
  const [config, setConfig] = useState<any>(defaults);
  const [ventas, setVentas] = useState<any[]>([]);
  const [ventaId, setVentaId] = useState("");
  const [cajaId, setCajaId] = useState("");
  const [qrImage, setQrImage] = useState("");
  const [pos, setPos] = useState({
    storeName: "Local principal",
    posName: "Caja 1",
    streetName: "",
    streetNumber: "",
    cityName: "",
    stateName: "",
    latitude: "",
    longitude: "",
    reference: "",
  });
  useEffect(() => {
    setConfig({ ...defaults, ...(data.config || {}) });
    if (!cajaId && data.cajas?.[0]) setCajaId(data.cajas[0].id);
  }, [data.config, data.cajas, cajaId]);
  useEffect(() => {
    if (!comercio) return;
    setPos((current) => ({
      ...current,
      streetName: current.streetName || comercio.calle || "",
      streetNumber: current.streetNumber || comercio.numero || "",
      cityName: current.cityName || comercio.localidad || "",
      stateName: current.stateName || comercio.provincia || "",
    }));
  }, [comercio]);
  useEffect(() => {
    if (!comercio?.id) return;
    void supabase.from("ventas").select(
      "id,numero_comprobante,total,cliente_nombre,fecha_venta",
    ).eq("comercio_id", comercio.id).order("fecha_venta", { ascending: false })
      .limit(30).then(({ data }) => setVentas(data || []));
  }, [comercio?.id]);
  const selected = useMemo(() => ventas.find((v) => v.id === ventaId), [
    ventas,
    ventaId,
  ]);
  async function connect() {
    const result = await run({
      action: "oauth_url",
      redirectTo: window.location.href.split("?")[0],
    });
    window.location.assign(result.url);
  }
  async function save() {
    await run({ action: "save_config", config });
  }
  async function createPos() {
    const latitude = Number(pos.latitude), longitude = Number(pos.longitude);
    if (
      !pos.storeName.trim() || !pos.posName.trim() || !pos.streetName.trim() ||
      !pos.streetNumber.trim() || !pos.cityName.trim() ||
      !pos.stateName.trim() || !pos.latitude.trim() || !pos.longitude.trim() ||
      !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 || Math.abs(longitude) > 180
    ) {
      window.alert(
        "Completa la direccion y las coordenadas validas de la sucursal",
      );
      return;
    }
    await run({
      action: "create_pos",
      storeName: pos.storeName,
      posName: pos.posName,
      location: {
        street_name: pos.streetName,
        street_number: pos.streetNumber,
        city_name: pos.cityName,
        state_name: pos.stateName,
        latitude,
        longitude,
        reference: pos.reference || undefined,
      },
    });
  }
  function useCurrentLocation() {
    if (!navigator.geolocation) {
      window.alert("Este navegador no permite obtener la ubicacion");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        setPos((current) => ({
          ...current,
          latitude: String(coords.latitude),
          longitude: String(coords.longitude),
        })),
      () =>
        window.alert(
          "No se pudo obtener la ubicacion. Habilita el permiso o ingresa las coordenadas manualmente.",
        ),
      { enableHighAccuracy: true },
    );
  }
  async function charge() {
    const result = await run({ action: "create_qr", ventaId, cajaId });
    if (!result.operacion.qr_data) {
      throw new Error(
        "Mercado Pago no devolvio la trama QR para esta modalidad",
      );
    }
    const qrData = String(result.operacion.qr_data);
    setQrImage(/^https?:\/\//i.test(qrData) ? qrData : await QRCode.toDataURL(qrData, { width: 360, margin: 2 }));
  }
  if (status.isLoading) {
    return <div className="p-6">Cargando Mercado Pago...</div>;
  }
  return (
    <div className="container mx-auto space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          <CreditCard />Mercado Pago
        </h1>
        <p className="text-muted-foreground">
          Configuracion, cobros QR y conciliacion de{" "}
          {comercio?.nombre_comercio}.
        </p>
      </div>
      <Tabs defaultValue="cuenta" className="space-y-6">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 md:grid-cols-5">
          <TabsTrigger value="cuenta">Cuenta</TabsTrigger>
          <TabsTrigger value="configuracion">Configuración</TabsTrigger>
          <TabsTrigger value="sucursales">Sucursales y cajas</TabsTrigger>
          <TabsTrigger value="cobros">Cobro QR</TabsTrigger>
          <TabsTrigger value="operaciones">Operaciones</TabsTrigger>
        </TabsList>
        <TabsContent value="cuenta" className="mt-0">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Cuenta conectada{" "}
            <Badge variant={config.connected ? "default" : "secondary"}>
              {config.connected ? "Conectada" : "Sin conectar"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {config.connected
            ? (
              <>
                <p>
                  <b>Cuenta:</b> {config.cuenta_email || config.mp_user_id}
                </p>
                <p className="text-sm text-muted-foreground">
                  Los cobros se acreditan directamente en esta cuenta.
                </p>
                <Button
                  variant="destructive"
                  disabled={isWorking}
                  onClick={() => run({ action: "disconnect" })}
                >
                  <Unplug className="mr-2 h-4 w-4" />Desconectar
                </Button>
              </>
            )
            : (
              <Button disabled={isWorking} onClick={connect}>
                <Link2 className="mr-2 h-4 w-4" />Conectar cuenta de Mercado
                Pago
              </Button>
            )}
        </CardContent>
      </Card>
        </TabsContent>
        <TabsContent value="configuracion" className="mt-0">
      <Card>
        <CardHeader>
          <CardTitle>Configuracion del comercio</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <div>
            <Label>Ambiente</Label>
            <Select
              value={config.ambiente}
              onValueChange={(v) => setConfig({ ...config, ambiente: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="test">Pruebas</SelectItem>
                <SelectItem value="production">Produccion</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Modo QR</Label>
            <Select
              value={config.modo_qr}
              onValueChange={(v) => setConfig({ ...config, modo_qr: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dynamic">Dinamico</SelectItem>
                <SelectItem value="static">Estatico</SelectItem>
                <SelectItem value="hybrid">Hibrido</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {[
            ["checkout_habilitado", "Checkout Pro en tienda online"],
            ["qr_habilitado", "Cobro presencial QR"],
            ["confirmar_pedido_automaticamente", "Confirmar pedidos pagados"],
            ["registrar_en_caja", "Registrar cobros en caja"],
            ["reservar_stock", "Reservar stock durante el pago"],
          ].map(([key, label]) => (
            <div
              className="flex items-center justify-between rounded border p-3"
              key={key}
            >
              <Label>{label}</Label>
              <Switch
                checked={Boolean(config[key])}
                onCheckedChange={(v) => setConfig({ ...config, [key]: v })}
              />
            </div>
          ))}
          <div>
            <Label>Vencimiento (minutos)</Label>
            <Input
              type="number"
              min={1}
              max={10080}
              value={config.minutos_reserva}
              onChange={(e) =>
                setConfig({
                  ...config,
                  minutos_reserva: Number(e.target.value),
                })}
            />
          </div>
          <div className="flex items-end">
            <Button disabled={isWorking} onClick={save}>
              Guardar configuracion
            </Button>
          </div>
        </CardContent>
      </Card>
        </TabsContent>
        <TabsContent value="sucursales" className="mt-0">
      {config.connected && config.qr_habilitado ? (
        <Card>
          <CardHeader>
            <CardTitle>Sucursales y cajas QR</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Mercado Pago exige la direccion real y las coordenadas del local.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Sucursal</Label>
                <Input
                  value={pos.storeName}
                  onChange={(e) =>
                    setPos({ ...pos, storeName: e.target.value })}
                />
              </div>
              <div>
                <Label>Caja</Label>
                <Input
                  value={pos.posName}
                  onChange={(e) => setPos({ ...pos, posName: e.target.value })}
                />
              </div>
              <div>
                <Label>Calle</Label>
                <Input
                  value={pos.streetName}
                  onChange={(e) =>
                    setPos({ ...pos, streetName: e.target.value })}
                />
              </div>
              <div>
                <Label>Numero</Label>
                <Input
                  value={pos.streetNumber}
                  onChange={(e) =>
                    setPos({ ...pos, streetNumber: e.target.value })}
                />
              </div>
              <div>
                <Label>Localidad</Label>
                <Input
                  value={pos.cityName}
                  onChange={(e) => setPos({ ...pos, cityName: e.target.value })}
                />
              </div>
              <div>
                <Label>Provincia</Label>
                <Select
                  value={pos.stateName}
                  onValueChange={(stateName) => setPos({ ...pos, stateName })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar provincia" />
                  </SelectTrigger>
                  <SelectContent>
                    {provincias.map((provincia) => (
                      <SelectItem key={provincia} value={provincia}>
                        {provincia}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Latitud</Label>
                <Input
                  inputMode="decimal"
                  value={pos.latitude}
                  onChange={(e) =>
                    setPos({
                      ...pos,
                      latitude: e.target.value.replace(",", "."),
                    })}
                />
              </div>
              <div>
                <Label>Longitud</Label>
                <Input
                  inputMode="decimal"
                  value={pos.longitude}
                  onChange={(e) =>
                    setPos({
                      ...pos,
                      longitude: e.target.value.replace(",", "."),
                    })}
                />
              </div>
              <div className="md:col-span-2">
                <Label>Referencia (opcional)</Label>
                <Input
                  value={pos.reference}
                  onChange={(e) =>
                    setPos({ ...pos, reference: e.target.value })}
                  placeholder="Frente a la plaza"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={useCurrentLocation}
              >
                <LocateFixed className="mr-2 h-4 w-4" />Usar mi ubicacion actual
              </Button>
              <Button disabled={isWorking} onClick={createPos}>
                Crear sucursal y caja
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {(data.cajas || []).map((c: any) => (
                <Badge key={c.id} variant="outline">
                  {c.sucursal?.nombre} / {c.nombre}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Conectá la cuenta y habilitá el cobro presencial QR desde Configuración para administrar sucursales y cajas.
          </CardContent>
        </Card>
      )}
        </TabsContent>
        <TabsContent value="cobros" className="mt-0">
      {config.connected && config.qr_habilitado ? (
        <Card>
          <CardHeader>
            <CardTitle>
              <QrCode className="mr-2 inline" />Cobrar una venta existente
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Venta</Label>
              <Select value={ventaId} onValueChange={setVentaId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar venta" />
                </SelectTrigger>
                <SelectContent>
                  {ventas.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      #{v.numero_comprobante} · {v.cliente_nombre} ·{" "}
                      {money(v.total)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Caja Mercado Pago</Label>
              <Select value={cajaId} onValueChange={setCajaId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar caja" />
                </SelectTrigger>
                <SelectContent>
                  {(data.cajas || []).map((c: any) => (
                    <SelectItem value={c.id} key={c.id}>{c.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Button
                disabled={isWorking || !selected || !cajaId}
                onClick={charge}
              >
                Generar QR por {selected ? money(selected.total) : "la venta"}
              </Button>
            </div>
            {qrImage && (
              <div className="md:col-span-2 text-center">
                <img
                  className="mx-auto max-w-[360px]"
                  src={qrImage}
                  alt="QR de cobro Mercado Pago"
                />
                <p className="font-semibold">
                  Esperando confirmacion de Mercado Pago
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Conectá la cuenta y habilitá el cobro presencial QR desde Configuración para generar cobros.
          </CardContent>
        </Card>
      )}
        </TabsContent>
        <TabsContent value="operaciones" className="mt-0">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Ultimas operaciones{" "}
            <Button
              size="sm"
              variant="outline"
              onClick={() => status.refetch()}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(data.operaciones || []).map((o: any) => (
            <div
              key={o.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded border p-3"
            >
              <div>
                <b>{o.modalidad === "qr" ? "QR" : "Checkout Pro"}</b>
                <p className="text-xs text-muted-foreground">
                  {o.external_reference}
                </p>
              </div>
              <span>{money(o.importe)}</span>
              <Badge>{o.estado}</Badge>
            </div>
          ))}
          {!data.operaciones?.length && (
            <p className="text-muted-foreground">Todavia no hay operaciones.</p>
          )}
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
