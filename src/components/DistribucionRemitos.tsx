import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Camera, FileDown, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDistribucion } from "@/hooks/useDistribucion";
import { useComercio } from "@/hooks/useComercio";
import { useToast } from "@/hooks/use-toast";
import { useObtenerCAE, useVentas } from "@/hooks/useVentas";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type {
  AccionDistribucion,
  RemitoDistribucion,
  RepartoDistribucion,
  ResumenDistribucion,
} from "@/types/distribucion";
import { buildRemitosDistribucionPrintHtml } from "@/utils/remitoDistribucionPrint";
import { printHtml } from "@/utils/documentoPrint";
import {
  distribucionMoney as money,
  resumenParada,
} from "@/utils/distribucion";

function useAccionesRemito() {
  const query = useDistribucion();
  const intentos = useRef(new Map<string, string>());
  const bloqueo = useRef(false);
  async function ejecutar(accion: AccionDistribucion, datos: Json) {
    if (bloqueo.current) return null;
    bloqueo.current = true;
    const firma = JSON.stringify({ accion, datos });
    const clave = intentos.current.get(firma) || crypto.randomUUID();
    intentos.current.set(firma, clave);
    try {
      const resultado = await query.operar({ accion, datos, clave });
      intentos.current.delete(firma);
      return resultado;
    } catch {
      return null;
    } finally {
      bloqueo.current = false;
    }
  }
  return { query, ejecutar };
}

function ConfiguracionRemitos({ data }: { data: ResumenDistribucion }) {
  const query = useDistribucion();
  const cfg = data.remitos_autorizacion;
  const [valores, setValores] = useState({
    punto_venta: String(cfg?.punto_venta || 1),
    cai: cfg?.cai || "",
    vencimiento: cfg?.vencimiento || "",
    desde: String(cfg?.desde || 1),
    hasta: String(cfg?.hasta || ""),
  });
  const [guardando, setGuardando] = useState(false);
  return (
    <details className="text-sm">
      <summary className="cursor-pointer py-2">
        Configurar autorización de remitos (opcional)
      </summary>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (guardando) return;
          setGuardando(true);
          try {
            await query.configurarRemitos({
              punto_venta: Number(valores.punto_venta),
              cai: valores.cai,
              vencimiento: valores.vencimiento,
              desde: Number(valores.desde),
              hasta: Number(valores.hasta),
            });
          } catch {
            /* El hook muestra el error y conserva los datos. */
          } finally {
            setGuardando(false);
          }
        }}
      >
        <p>
          Ingresá el CAI, punto de emisión y rango ya autorizados para el
          comercio. Esta configuración no solicita una autorización nueva a
          ARCA. Para constancias no fiscales no hace falta configurarla.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {([
            ["punto_venta", "Punto de emisión", "number"],
            ["cai", "CAI (14 dígitos)", "text"],
            ["vencimiento", "Vencimiento", "date"],
            ["desde", "Desde", "number"],
            ["hasta", "Hasta", "number"],
          ] as const).map(([key, label, type]) => (
            <div key={key}>
              <Label htmlFor={`remitos-config-${key}`}>{label}</Label>
              <Input
                id={`remitos-config-${key}`}
                required
                type={type}
                min={type === "number" ? 1 : undefined}
                value={valores[key]}
                onChange={(e) =>
                  setValores({ ...valores, [key]: e.target.value })}
              />
            </div>
          ))}
        </div>
        {cfg && (
          <p>
            Último número emitido:{" "}
            {cfg.ultimo}. Los números usados y documentos emitidos se conservan.
          </p>
        )}
        <Button disabled={guardando}>
          {guardando ? "Guardando..." : "Guardar autorización"}
        </Button>
      </form>
    </details>
  );
}

export function RemitosReparto(
  { data, reparto }: {
    data: ResumenDistribucion;
    reparto: RepartoDistribucion;
  },
) {
  const { comercio } = useComercio();
  const { query, ejecutar } = useAccionesRemito();
  const { toast } = useToast();
  const [imprimiendo, setImprimiendo] = useState(false);
  const [usarCai, setUsarCai] = useState(false);
  const remitos = (data.remitos || []).filter((m) =>
    m.reparto_id === reparto.id && m.estado !== "anulado"
  ).sort((a, b) =>
    (data.paradas.find(p => p.id === a.parada_id)?.orden || 0) -
    (data.paradas.find(p => p.id === b.parada_id)?.orden || 0)
  );
  async function imprimir(pdf: boolean) {
    if (!comercio || imprimiendo) return;
    setImprimiendo(true);
    try {
      await printHtml(
        buildRemitosDistribucionPrintHtml(
          remitos,
          data.remito_items || [],
          comercio,
        ),
      );
      if (pdf) {
        toast({
          title: "Remitos del reparto",
          description: 'Elegí "Guardar como PDF" en el diálogo de impresión.',
        });
      }
    } catch (error) {
      toast({
        title: "No se pudo imprimir",
        description: error instanceof Error
          ? error.message
          : "Intentá nuevamente.",
        variant: "destructive",
      });
    } finally {
      setImprimiendo(false);
    }
  }
  if (!reparto.circuito_remitos) return null;
  return (
    <div className="space-y-3 border-t pt-3">
      <h3 className="font-medium">Remitos para entregar al cliente</h3>
      <p className="text-sm text-muted-foreground">
        Imprimí dos ejemplares por cliente antes de salir: uno queda con el
        cliente y otro vuelve firmado. Anotá los faltantes y rechazos en ambos
        ejemplares.
      </p>
      <p className="text-sm text-muted-foreground">
        Podés generar un remito no fiscal y luego facturar lo entregado. Para
        respaldar el traslado con remito autorizado, configurá el CAI y rango
        del comercio.
      </p>
      {data.admin && reparto.estado === "planificado" && remitos.length === 0 &&
        (
          <>
            <ConfiguracionRemitos
              key={data.remitos_autorizacion?.cai || "sin-cai"}
              data={data}
            />
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={usarCai}
                disabled={!data.remitos_autorizacion}
                onChange={(e) => setUsarCai(e.target.checked)}
              />Usar numeración de remitos con CAI. Sin marcar: remito interno
              no fiscal.
            </label>
          </>
        )}
      <div className="flex flex-wrap gap-2">
        {data.admin && reparto.estado === "planificado" &&
          remitos.length === 0 && (
          <Button
            disabled={query.trabajando ||
              !data.paradas.some((p) => p.reparto_id === reparto.id)}
            onClick={() =>
              ejecutar("emitir_remitos", {
                reparto_id: reparto.id,
                usar_cai: usarCai,
              })}
          >
            Generar remitos del reparto
          </Button>
        )}
        {remitos.length > 0 && (
          <>
            <Button
              variant="print"
              disabled={imprimiendo || !comercio}
              onClick={() => imprimir(false)}
            >
              <Printer className="mr-2 h-4 w-4" />Imprimir remitos del reparto
            </Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={imprimiendo || !comercio}
              onClick={() => imprimir(true)}
            >
              <FileDown className="mr-2 h-4 w-4" />PDF de remitos
            </Button>
          </>
        )}
      </div>
      {remitos.length > 0 && (
        <p className="text-sm">
          {remitos.length}{" "}
          remitos preparados. La carga queda fijada; para cambiarla, cancelá el
          reparto y armá uno nuevo.
        </p>
      )}
      {data.admin && reparto.estado === "planificado" && remitos.length > 0 && (
        <Button
          variant="outline"
          disabled={query.trabajando || reparto.papeles_preparados}
          onClick={() =>
            ejecutar("confirmar_papeles", { reparto_id: reparto.id })}
        >
          {reparto.papeles_preparados
            ? "Ejemplares impresos confirmados"
            : "Confirmar que llevo dos ejemplares impresos por cliente"}
        </Button>
      )}
    </div>
  );
}

export function EntregaRemito(
  { data, reparto, remito, cobrar }: {
    data: ResumenDistribucion;
    reparto: RepartoDistribucion;
    remito: RemitoDistribucion;
    cobrar: () => void;
  },
) {
  const { query, ejecutar } = useAccionesRemito();
  const { comercio } = useComercio();
  const { toast } = useToast();
  const items = (data.remito_items || []).filter((i) =>
    i.remito_id === remito.id
  );
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [recibio, setRecibio] = useState("");
  const [firma, setFirma] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const fotoPendiente = useRef<{ file: File; path: string } | null>(null);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [devolucion, setDevolucion] = useState<
    { itemId: string; cantidad: string; motivo: string } | null
  >(null);
  const resumen = resumenParada(data, remito.parada_id);
  const editable = reparto.estado === "en_reparto" &&
    remito.estado === "emitido";
  async function guardarFoto() {
    if (!foto || !comercio || subiendo) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(foto.type) ||
      foto.size > 10485760
    ) {
      toast({
        title: "Foto inválida",
        description: "Elegí una foto JPG, PNG o WebP de hasta 10 MB.",
        variant: "destructive",
      });
      return;
    }
    setSubiendo(true);
    try {
      if (fotoPendiente.current?.file !== foto) {
        fotoPendiente.current = {
          file: foto,
          path: `${comercio.id}/${remito.id}/${crypto.randomUUID()}.${
            foto.type === "image/png"
              ? "png"
              : foto.type === "image/webp"
              ? "webp"
              : "jpg"
          }`,
        };
      }
      const path = fotoPendiente.current.path;
      const { error } = await supabase.storage.from("distribucion-remitos")
        .upload(path, foto, { upsert: false });
      if (
        error && String((error as { statusCode?: string }).statusCode) !== "409"
      ) throw error;
      if (
        await ejecutar("foto_remito", {
          reparto_id: reparto.id,
          remito_id: remito.id,
          path,
        })
      ) {
        setFoto(null);
        fotoPendiente.current = null;
      }
    } catch (error) {
      toast({
        title: "No se pudo adjuntar la foto",
        description: error instanceof Error
          ? error.message
          : "Reintentá con la misma foto.",
        variant: "destructive",
      });
    } finally {
      setSubiendo(false);
    }
  }
  async function verFoto() {
    if (!remito.foto_path) return;
    const { data: result, error } = await supabase.storage.from(
      "distribucion-remitos",
    ).createSignedUrl(remito.foto_path, 300);
    if (error) {
      toast({
        title: "No se pudo abrir la foto",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    setFotoUrl(result.signedUrl);
  }
  return (
    <section className="space-y-3 border-t pt-4">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <h3 className="font-semibold">
            Remito #{remito.numero} · {remito.cliente_nombre}
          </h3>
          <p className="text-sm">{remito.direccion}</p>
          {remito.telefono && (
            <a className="text-sm underline" href={`tel:${remito.telefono}`}>
              Llamar al cliente
            </a>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <Badge>
          {remito.estado === "emitido"
            ? "Pendiente de visita"
            : remito.estado === "confirmado"
            ? "Entrega confirmada"
            : "Anulado"}
        </Badge>
        {remito.estado === "confirmado" && <>
          {remito.venta_id && data.admin && <>
            <Button variant="outline" size="sm" asChild><Link to={`/ventas?detalle=${remito.venta_id}`}>Ver comprobante</Link></Button>
            <Button variant="outline" size="sm" asChild><Link to={`/cuenta-corriente/${remito.cliente_id}`}>Cobros y cuenta corriente</Link></Button>
          </>}
          {remito.foto_path && <Button variant="outline" size="sm" onClick={verFoto}><Camera className="mr-2 h-4 w-4"/>Ver remito firmado</Button>}
        </>}
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Producto</TableHead>
            <TableHead className="text-right">Previsto</TableHead>
            <TableHead className="text-right">Recibido</TableHead>
            <TableHead className="text-right">Devuelto</TableHead>
            <TableHead>Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((i) => (
            <TableRow key={i.id}>
              <TableCell>{i.descripcion}</TableCell>
              <TableCell className="text-right">{i.cantidad}</TableCell>
              <TableCell className="text-right">
                {editable
                  ? (
                    <Input
                      className="ml-auto w-20"
                      type="number"
                      min={0}
                      max={i.cantidad}
                      step={1}
                      aria-label={`Recibido de ${i.descripcion}`}
                      value={cantidades[i.id] ?? i.cantidad}
                      onChange={(e) =>
                        setCantidades({
                          ...cantidades,
                          [i.id]: Number(e.target.value),
                        })}
                    />
                  )
                  : i.recibida}
              </TableCell>
              <TableCell className="text-right">{i.devuelta}</TableCell>
              <TableCell>
                {data.admin && remito.estado === "confirmado" &&
                  !remito.venta_id && i.recibida > i.devuelta && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={query.trabajando}
                    onClick={() =>
                      setDevolucion({
                        itemId: i.id,
                        cantidad: "1",
                        motivo: "",
                      })}
                  >
                    Devolución
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {editable && (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            await ejecutar("confirmar_remito", {
              reparto_id: reparto.id,
              remito_id: remito.id,
              recibido_por: recibio,
              firma_papel: firma,
              motivo,
              items: items.map((i) => ({
                item_id: i.id,
                recibida: cantidades[i.id] ?? i.cantidad,
              })),
            });
          }}
        >
          <p className="text-sm">
            Registrá lo que el cliente recibió y anotá las diferencias en los
            dos ejemplares impresos.
          </p>
          <Label htmlFor={`recibio-${remito.id}`}>
            Nombre de quien recibió
          </Label>
          <Input
            id={`recibio-${remito.id}`}
            value={recibio}
            onChange={(e) => setRecibio(e.target.value)}
          />
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={firma}
              onChange={(e) => setFirma(e.target.checked)}
            />El cliente firmó ambos ejemplares del remito.
          </label>
          <Label htmlFor={`motivo-${remito.id}`}>
            Motivo de faltantes, rechazo u observaciones
          </Label>
          <Textarea
            id={`motivo-${remito.id}`}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
          <Button disabled={query.trabajando}>Confirmar entrega</Button>
        </form>
      )}
      {remito.estado === "confirmado" && (
        <>
          <p className="text-sm">
            Recibió: <b>{remito.recibido_por || "Sin recepción"}</b>
            {remito.firma_papel && " · Firma registrada en papel"}
            {remito.motivo && ` · ${remito.motivo}`}
          </p>
          <p className="text-sm">
            Entrega neta: <b>{money(resumen.total)}</b> · Cobrado:{" "}
            <b>{money(resumen.cobrado)}</b>
            {remito.venta_id && (
              <>
                · Saldo:{" "}
                <b>
                  {money(
                    Number(
                      data.saldos.find((s) => s.venta_id === remito.venta_id)
                        ?.saldo || 0,
                    ),
                  )}
                </b>
              </>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            {reparto.estado === "en_reparto" && (
              <Button
                disabled={query.trabajando || resumen.saldo <= 0}
                onClick={cobrar}
              >
                Registrar cobro
              </Button>
            )}
          </div>
          {!remito.foto_path && (
              <div className="space-y-2">
                <Label htmlFor={`foto-${remito.id}`}>
                  Foto del ejemplar firmado
                </Label>
                <Input
                  id={`foto-${remito.id}`}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  onChange={(e) => setFoto(e.target.files?.[0] || null)}
                />
                <Button
                  variant="outline"
                  disabled={!foto || subiendo || query.trabajando}
                  onClick={guardarFoto}
                >
                  {subiendo ? "Subiendo..." : "Guardar foto del remito firmado"}
                </Button>
              </div>
            )}
        </>
      )}
      <Dialog
        open={Boolean(fotoUrl)}
        onOpenChange={(open) => {
          if (!open) setFotoUrl(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] max-w-4xl overflow-auto">
          <DialogHeader>
            <DialogTitle>Remito firmado #{remito.numero}</DialogTitle>
            <DialogDescription>{remito.cliente_nombre}</DialogDescription>
          </DialogHeader>
          {fotoUrl && (
            <img
              src={fotoUrl}
              alt={`Remito firmado por ${
                remito.recibido_por || remito.cliente_nombre
              }`}
              className="max-h-[70dvh] w-full object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(devolucion)}
        onOpenChange={(open) => {
          if (!open) setDevolucion(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar devolución</DialogTitle>
            <DialogDescription>
              Repone existencias y reduce la cantidad pendiente de facturar.
              Conserva el remito impreso y el historial.
            </DialogDescription>
          </DialogHeader>
          {devolucion && (
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await ejecutar("devolver_remito", {
                    reparto_id: reparto.id,
                    remito_id: remito.id,
                    item_id: devolucion.itemId,
                    cantidad: Number(devolucion.cantidad),
                    motivo: devolucion.motivo,
                  })
                ) setDevolucion(null);
              }}
            >
              <Label>Cantidad</Label>
              <Input
                type="number"
                min={1}
                step={1}
                value={devolucion.cantidad}
                onChange={(e) =>
                  setDevolucion({ ...devolucion, cantidad: e.target.value })}
              />
              <Label>Motivo</Label>
              <Textarea
                required
                value={devolucion.motivo}
                onChange={(e) =>
                  setDevolucion({ ...devolucion, motivo: e.target.value })}
              />
              <Button disabled={query.trabajando}>Confirmar devolución</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function FacturacionRemitos({ data }: { data: ResumenDistribucion }) {
  const { query, ejecutar } = useAccionesRemito();
  const ventas = useVentas();
  const cae = useObtenerCAE();
  const [seleccion, setSeleccion] = useState<RemitoDistribucion | null>(null);
  const [tipo, setTipo] = useState("");
  const [todos, setTodos] = useState(false);
  const remitos = (data.remitos || []).filter((m) =>
    m.estado === "confirmado" && (todos || !m.venta_id)
  );
  const cantidadNeta = (id: string) =>
    (data.remito_items || []).filter((i) => i.remito_id === id).reduce(
      (sum, i) => sum + i.recibida - i.devuelta,
      0,
    );
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={todos}
          onChange={(e) => setTodos(e.target.checked)}
        />Mostrar también los facturados
      </label>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Remito</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Total neto</TableHead>
            <TableHead>Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {remitos.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center">
                No hay remitos confirmados pendientes de facturar.
              </TableCell>
            </TableRow>
          )}
          {remitos.map((m) => {
            const reparto = data.repartos.find((r) => r.id === m.reparto_id);
            const venta = ventas.ventas.find((v) => v.id === m.venta_id);
            return (
              <TableRow key={m.id}>
                <TableCell>#{m.numero}</TableCell>
                <TableCell className="font-medium">
                  {m.cliente_nombre}
                </TableCell>
                <TableCell>{m.fecha}</TableCell>
                <TableCell>
                  {m.venta_id
                    ? venta?.cae
                      ? "Facturado"
                      : venta?.tipo_comprobante === "recibo_x"
                      ? "Recibo X"
                      : "Pendiente de CAE"
                    : cantidadNeta(m.id) === 0
                    ? "Sin mercadería recibida"
                    : reparto?.estado !== "rendido"
                    ? "Por rendir"
                    : "Pendiente de facturar"}
                </TableCell>
                <TableCell className="text-right">
                  {money(resumenParada(data, m.parada_id).total)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    {!m.venta_id
                      ? (
                        <Button
                          disabled={query.trabajando ||
                            reparto?.estado !== "rendido" ||
                            cantidadNeta(m.id) === 0}
                          onClick={() => {
                            setSeleccion(m);
                            setTipo("");
                          }}
                        >
                          Facturar
                        </Button>
                      )
                      : (
                        <>
                          <Button variant="outline" asChild>
                            <Link to={`/ventas?detalle=${m.venta_id}`}>
                              Ver comprobante
                            </Link>
                          </Button>
                          {venta && venta.tipo_comprobante !== "recibo_x" &&
                            !venta.cae && (
                            <Button
                              disabled={cae.isPending}
                              onClick={() => cae.mutate(m.venta_id!)}
                            >
                              Solicitar CAE
                            </Button>
                          )}
                        </>
                      )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <Dialog
        open={Boolean(seleccion)}
        onOpenChange={(open) => {
          if (!open && !query.trabajando) setSeleccion(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] max-w-3xl overflow-auto">
          <DialogHeader>
            <DialogTitle>Facturar remito #{seleccion?.numero}</DialogTitle>
            <DialogDescription>
              {seleccion?.cliente_nombre}. Los productos, cantidades y precios
              vienen de la entrega confirmada. La factura no vuelve a descontar
              stock.
            </DialogDescription>
          </DialogHeader>
          {seleccion && (
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                const ventaId = await ejecutar("facturar_remito", {
                  reparto_id: seleccion.reparto_id,
                  remito_id: seleccion.id,
                  tipo_comprobante: tipo,
                });
                if (ventaId) {
                  setSeleccion(null);
                  setTodos(true);
                  if (tipo !== "recibo_x") cae.mutate(ventaId);
                }
              }}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Cantidad</TableHead>
                    <TableHead>Precio</TableHead>
                    <TableHead>Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data.remito_items || []).filter((i) =>
                    i.remito_id === seleccion.id && i.recibida > i.devuelta
                  ).map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>{i.descripcion}</TableCell>
                      <TableCell>{i.recibida - i.devuelta}</TableCell>
                      <TableCell>{money(Number(i.precio))}</TableCell>
                      <TableCell>
                        {money(
                          Math.round(
                            (i.recibida - i.devuelta) * Number(i.precio) * 100,
                          ) / 100,
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Label htmlFor="remito-tipo-factura">Tipo de comprobante</Label>
              <select
                id="remito-tipo-factura"
                required
                className="h-11 w-full rounded-md border bg-background px-3"
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
              >
                <option value="">Seleccionar</option>
                <option value="factura_a">Factura A</option>
                <option value="factura_b">Factura B</option>
                <option value="factura_c">Factura C</option>
                <option value="recibo_x">Recibo X no fiscal</option>
              </select>
              <p className="text-sm text-muted-foreground">
                Los cobros del reparto se imputan una sola vez. Para facturas A,
                B y C se solicita CAE con la configuración ARCA existente; si
                falla, podés reintentar desde el comprobante sin generar otra
                factura.
              </p>
              <Button disabled={query.trabajando || !tipo || cae.isPending}>
                Generar comprobante
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
