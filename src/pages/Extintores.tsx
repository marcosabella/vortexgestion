import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Download, Eye, Flame, MessageCircle, Pencil, Plus, Printer, Search, Trash2 } from "lucide-react";
import { useClientes } from "@/hooks/useClientes";
import { useComercio } from "@/hooks/useComercio";
import { Extintor, useExtintores } from "@/hooks/useExtintores";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildExtintoresReportePdfFile } from "@/utils/extintoresReportePdf";
import { downloadPdfFile, printPdfFile } from "@/utils/ordenTrabajoPdf";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
const vacio = {
  cliente_id: "",
  numero_extintor: "",
  numero_serie: "",
  sector: "",
  marca_id: "",
  clase_id: "",
  anio_prueba_hidraulica: "",
  fecha_ultima_recarga: "",
  fecha_proxima_recarga: "",
  fecha_vencimiento: "",
  anio_fabricacion: "",
};
export default function Extintores() {
  const { data: clientes = [] } = useClientes();
  const { comercio } = useComercio();
  const {
    extintores,
    marcas,
    clases,
    save,
    remove,
    saveCatalogo,
    removeCatalogo,
    saving,
  } = useExtintores();
  const [f, setF] = useState<any>(vacio),
    [open, setOpen] = useState(false),
    [sel, setSel] = useState(false),
    [buscar, setBuscar] = useState(""),
    [cat, setCat] = useState<"extintor_marcas" | "extintor_clases" | null>(
      null,
    ),
    [nuevo, setNuevo] = useState("");
  const [ver, setVer] = useState<Extintor | null>(null);
  const [filtro, setFiltro] = useState("");
  const [vencimientoDesde, setVencimientoDesde] = useState("");
  const [vencimientoHasta, setVencimientoHasta] = useState("");
  const [recargaDesde, setRecargaDesde] = useState("");
  const [recargaHasta, setRecargaHasta] = useState("");
  const set = (k: string, v: string) => setF((x: any) => ({ ...x, [k]: v }));
  const fecha = (valor?: string | null) =>
    valor ? format(new Date(`${valor}T00:00:00`), "dd/MM/yyyy") : "-";
  const clientesFiltrados = useMemo(
    () =>
      clientes.filter((c) =>
        `${c.nombre} ${c.apellido} ${c.cuit}`.toLowerCase().includes(
          buscar.toLowerCase(),
        )
      ),
    [clientes, buscar],
  );
  const abrir = (e?: Extintor) => {
    setF(
      e
        ? { ...e, marca_id: e.marca_id || "", clase_id: e.clase_id || "" }
        : vacio,
    );
    setOpen(true);
  };
  const extintoresFiltrados = useMemo(() => {
    const termino = filtro.trim().toLowerCase();
    return extintores.filter((extintor) =>
      `${extintor.cliente?.nombre || ""} ${
        extintor.cliente?.apellido || ""
      } ${extintor.numero_extintor} ${extintor.numero_serie} ${
        extintor.marca?.nombre || ""
      } ${extintor.clase?.nombre || ""}`.toLowerCase().includes(termino) &&
      (!vencimientoDesde ||
        (extintor.fecha_vencimiento || "") >= vencimientoDesde) &&
      (!vencimientoHasta ||
        (extintor.fecha_vencimiento || "") <= vencimientoHasta) &&
      (!recargaDesde ||
        (extintor.fecha_proxima_recarga || "") >= recargaDesde) &&
      (!recargaHasta || (extintor.fecha_proxima_recarga || "") <= recargaHasta)
    );
  }, [
    extintores,
    filtro,
    vencimientoDesde,
    vencimientoHasta,
    recargaDesde,
    recargaHasta,
  ]);
  const guardar = () =>
    save({ ...f, marca_id: f.marca_id || null, clase_id: f.clase_id || null }, {
      onSuccess: () => {
        setOpen(false);
        setF(vacio);
      },
    });
  const generarReporte = () => buildExtintoresReportePdfFile(extintoresFiltrados, comercio);
  const compartirReporte = async () => {
    const file = await generarReporte(); const texto = `Reporte de ${extintoresFiltrados.length} extintores según filtros.`; const shareData: ShareData = { title: "Reporte de extintores", text: texto, files: [file] };
    try { if (navigator.share && navigator.canShare?.(shareData)) { await navigator.share(shareData); return; } } catch (error) { if (error instanceof DOMException && error.name === "AbortError") return; }
    downloadPdfFile(file); window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener,noreferrer");
  };
  const campos = [
    "numero_extintor",
    "numero_serie",
    "sector",
    "anio_prueba_hidraulica",
    "fecha_ultima_recarga",
    "fecha_proxima_recarga",
    "fecha_vencimiento",
    "anio_fabricacion",
  ];
  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex justify-between">
        <div>
          <h1 className="flex gap-2 text-3xl font-bold">
            <Flame />Extintores
          </h1>
          <p className="text-muted-foreground">
            Asignación y vencimientos por cliente.
          </p>
        </div>
        <div className="flex flex-wrap gap-2"><Button className="bg-red-600 text-white hover:bg-red-700" disabled={!extintoresFiltrados.length} onClick={async () => downloadPdfFile(await generarReporte())}><Download />PDF reporte</Button><Button variant="print" disabled={!extintoresFiltrados.length} onClick={async () => printPdfFile(await generarReporte())}><Printer />Imprimir reporte</Button><Button className="bg-[#25D366] text-white hover:bg-[#1DA851]" disabled={!extintoresFiltrados.length} onClick={compartirReporte}><MessageCircle />WhatsApp</Button><Button onClick={() => abrir()}><Plus />Nuevo extintor</Button></div>
      </div>
      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <div className="space-y-1 xl:col-span-2">
              <Label className="text-xs text-muted-foreground">
                Búsqueda general
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={filtro}
                  onChange={(event) => setFiltro(event.target.value)}
                  placeholder="Buscar por cliente, número, serie, marca o clase"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Vencimiento desde
              </Label>
              <Input
                type="date"
                aria-label="Vencimiento desde"
                value={vencimientoDesde}
                onChange={(event) => setVencimientoDesde(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Vencimiento hasta
              </Label>
              <Input
                type="date"
                aria-label="Vencimiento hasta"
                value={vencimientoHasta}
                onChange={(event) => setVencimientoHasta(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Próxima recarga desde
              </Label>
              <Input
                type="date"
                aria-label="Próxima recarga desde"
                value={recargaDesde}
                onChange={(event) => setRecargaDesde(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Próxima recarga hasta
              </Label>
              <Input
                type="date"
                aria-label="Próxima recarga hasta"
                value={recargaHasta}
                onChange={(event) => setRecargaHasta(event.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Número / Serie</TableHead>
                <TableHead>Marca / Clase</TableHead>
                <TableHead>Sector</TableHead>
                <TableHead>Próxima recarga</TableHead>
                <TableHead>Vencimiento</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {extintoresFiltrados.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>
                    {e.cliente?.nombre} {e.cliente?.apellido}
                  </TableCell>
                  <TableCell>{e.numero_extintor} / {e.numero_serie}</TableCell>
                  <TableCell>
                    {e.marca?.nombre || "-"} / {e.clase?.nombre || "-"}
                  </TableCell>
                  <TableCell>{e.sector || "-"}</TableCell>
                  <TableCell>{fecha(e.fecha_proxima_recarga)}</TableCell>
                  <TableCell>{fecha(e.fecha_vencimiento)}</TableCell>
                  <TableCell className="flex gap-2">
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => abrir(e)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => setVer(e)}
                    >
                      <Eye />
                    </Button>
                    <Button
                      size="icon"
                      variant="destructive"
                      onClick={() => remove(e.id)}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Extintor</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Cliente</Label>
              <div className="mt-2 flex gap-2">
                <Input
                  readOnly
                  value={f.cliente_id
                    ? `${
                      clientes.find((c) => c.id === f.cliente_id)?.nombre || ""
                    } ${
                      clientes.find((c) => c.id === f.cliente_id)?.apellido ||
                      ""
                    }`
                    : ""}
                  placeholder="Seleccionar cliente..."
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSel(true)}
                >
                  <Search className="mr-2 h-4 w-4" />Buscar
                </Button>
              </div>
            </div>
            {campos.map((k) => (
              <div key={k}>
                <Label>
                  {{
                    anio_prueba_hidraulica: "Año prueba hidráulica",
                    anio_fabricacion: "Año fabricación",
                    numero_extintor: "Número de extintor",
                    numero_serie: "Número de serie",
                    sector: "Sector",
                    fecha_ultima_recarga: "Fecha última recarga",
                    fecha_proxima_recarga: "Fecha próxima recarga",
                    fecha_vencimiento: "Fecha vencimiento",
                  }[k]}
                </Label>
                <Input
                  type={k.includes("fecha")
                    ? "date"
                    : k.includes("anio")
                    ? "number"
                    : "text"}
                  value={f[k] || ""}
                  onChange={(e) => set(k, e.target.value)}
                />
              </div>
            ))}
            {[["marca_id", "Marca", marcas, "extintor_marcas"], [
              "clase_id",
              "Clase",
              clases,
              "extintor_clases",
            ]].map(([k, l, items, t]: any) => (
              <div key={k}>
                <Label>{l}</Label>
                <div className="mt-2 flex gap-2">
                  <Select value={f[k]} onValueChange={(v) => set(k, v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar" />
                    </SelectTrigger>
                    <SelectContent>
                      {items.map((i: any) => (
                        <SelectItem key={i.id} value={i.id}>
                          {i.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    className="bg-green-600 text-lg hover:bg-green-700"
                    onClick={() => setCat(t)}
                  >
                    +
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <Button
            disabled={!f.cliente_id || !f.numero_extintor || !f.numero_serie ||
              saving}
            onClick={guardar}
          >
            Guardar
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={sel} onOpenChange={setSel}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Seleccionar Cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
                placeholder="Buscar por nombre, apellido o CUIT..."
              />
            </div>
            <div className="max-h-96 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>CUIT</TableHead>
                    <TableHead>Localidad</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientesFiltrados.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>{c.nombre} {c.apellido}</TableCell>
                      <TableCell>{c.cuit}</TableCell>
                      <TableCell>{c.localidad || "-"}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            set("cliente_id", c.id!);
                            setSel(false);
                            setBuscar("");
                          }}
                        >
                          Elegir
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!cat} onOpenChange={() => setCat(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              Gestionar {cat === "extintor_marcas" ? "marcas" : "clases"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex gap-2">
            <Input value={nuevo} onChange={(e) => setNuevo(e.target.value)} />
            <Button
              onClick={() => {
                if (cat && nuevo) {
                  saveCatalogo({ tabla: cat, nombre: nuevo });
                  setNuevo("");
                }
              }}
            >
              Agregar
            </Button>
          </div>
          {(cat === "extintor_marcas" ? marcas : clases).map((x) => (
            <div className="flex justify-between border-b p-2" key={x.id}>
              {x.nombre}
              <Button
                size="icon"
                variant="ghost"
                onClick={() =>
                  cat && removeCatalogo({ tabla: cat, id: x.id })}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </DialogContent>
      </Dialog>
      <Dialog open={!!ver} onOpenChange={(abierto) => !abierto && setVer(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detalle de Extintor</DialogTitle>
          </DialogHeader>
          {false && ver && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-1 gap-x-10 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
              <p>
                <strong>Cliente:</strong> {ver.cliente?.nombre}{" "}
                {ver.cliente?.apellido}
              </p>
              </div>
              <div className="rounded-md bg-muted/30 p-4">
              <p>
                <strong>Sector:</strong> {ver.sector || "-"}
              </p>
              <p>
                <strong>Número / Serie:</strong> {ver.numero_extintor} /{" "}
                {ver.numero_serie}
              </p>
              <p>
                <strong>Marca / Clase:</strong> {ver.marca?.nombre || "-"} /
                {" "}
                {ver.clase?.nombre || "-"}
              </p>
              <p>
                <strong>Próxima recarga:</strong>{" "}
                {fecha(ver.fecha_proxima_recarga)}
              </p>
              <p>
                <strong>Vencimiento:</strong> {fecha(ver.fecha_vencimiento)}
              </p>
              <p>
                <strong>Última recarga:</strong>{" "}
                {fecha(ver.fecha_ultima_recarga)}
              </p>
              <p>
                <strong>Año de fabricación:</strong>{" "}
                {ver.anio_fabricacion || "-"}
              </p>
              <p>
                <strong>Año prueba hidráulica:</strong>{" "}
                {ver.anio_prueba_hidraulica || "-"}
              </p>
            </div>
            </div>
          )}
          {ver && <div className="space-y-4 text-sm"><div className="mb-4 space-y-3"><div className="grid grid-cols-1 gap-x-10 gap-y-2 sm:grid-cols-2 lg:grid-cols-4"><p><strong>Número:</strong> {ver.numero_extintor}</p><p><strong>Serie:</strong> {ver.numero_serie}</p><p><strong>Sector:</strong> {ver.sector || "-"}</p><p><strong>Clase:</strong> {ver.clase?.nombre || "-"}</p></div><p><strong>Cliente:</strong> {ver.cliente?.nombre} {ver.cliente?.apellido}</p></div><div><h4 className="mb-2 font-semibold">Datos del extintor</h4><Table><TableHeader><TableRow><TableHead>Marca</TableHead><TableHead>Clase</TableHead><TableHead>Año de fabricación</TableHead><TableHead>Año prueba hidráulica</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell>{ver.marca?.nombre || "-"}</TableCell><TableCell>{ver.clase?.nombre || "-"}</TableCell><TableCell>{ver.anio_fabricacion || "-"}</TableCell><TableCell>{ver.anio_prueba_hidraulica || "-"}</TableCell></TableRow></TableBody></Table></div><div><h4 className="mb-2 font-semibold">Recargas y vencimientos</h4><Table><TableHeader><TableRow><TableHead>Última recarga</TableHead><TableHead>Próxima recarga</TableHead><TableHead>Vencimiento</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell>{fecha(ver.fecha_ultima_recarga)}</TableCell><TableCell>{fecha(ver.fecha_proxima_recarga)}</TableCell><TableCell>{fecha(ver.fecha_vencimiento)}</TableCell></TableRow></TableBody></Table></div></div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
