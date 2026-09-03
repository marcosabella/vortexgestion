import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Power, PowerOff, Search } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import type { CampoEstadoFilter } from "@/types/campo";

type Base = {
  id: string;
  nombre: string;
  codigo_interno: string | null;
  activo: boolean;
};
type Props<T extends Base> = {
  title: string;
  singular: string;
  icon: React.ReactNode;
  comercioId: string | null;
  comercioNombre: string | null;
  isComercioLoading: boolean;
  access: {
    isLoading: boolean;
    error: unknown;
    perteneceAlComercio: boolean;
    isAdmin: boolean;
  };
  query: { data?: T[]; isLoading: boolean; error: unknown };
  searchLabel: string;
  searchText: (item: T) => string;
  headers: string[];
  cells: (item: T) => React.ReactNode[];
  renderForm: (
    mode: "create" | "edit",
    item: T | null,
    onSuccess: () => void,
    onSaving: (v: boolean) => void,
  ) => React.ReactNode;
  setStatus: {
    isPending: boolean;
    mutateAsync: (v: { id: string; activo: boolean }) => Promise<unknown>;
  };
};

export function CampoCatalogList<T extends Base>(p: Props<T>) {
  const [term, setTerm] = useState(""),
    [filter, setFilter] = useState<CampoEstadoFilter>("activos"),
    [creating, setCreating] = useState(false),
    [editing, setEditing] = useState<T | null>(null),
    [status, setStatus] = useState<T | null>(null),
    [saving, setSaving] = useState(false);
  const allowed = p.access.perteneceAlComercio && !p.access.isLoading &&
    !p.access.error;
  useEffect(() => {
    setCreating(false);
    setEditing(null);
    setStatus(null);
    setSaving(false);
  }, [p.comercioId, allowed]);
  const rows = useMemo(() => {
    if (!allowed) return [];
    const q = term.trim().toLocaleLowerCase("es");
    return (p.query.data ?? []).filter((x) =>
      (filter === "todos" || (filter === "activos" ? x.activo : !x.activo)) &&
      (!q || p.searchText(x).toLocaleLowerCase("es").includes(q))
    );
  }, [allowed, filter, p, term]);
  const close = () => {
    if (!saving) {
      setCreating(false);
      setEditing(null);
    }
  };
  const confirm = async () => {
    if (!status) return;
    try {
      await p.setStatus.mutateAsync({ id: status.id, activo: !status.activo });
      setStatus(null);
    } catch { /* el hook informa y conserva la confirmación */ }
  };
  const loading = p.isComercioLoading || p.access.isLoading ||
    (allowed && p.query.isLoading);
  const message = !p.comercioId
    ? "No hay un comercio activo seleccionado."
    : p.access.error
    ? "No se pudo verificar el acceso."
    : !p.access.perteneceAlComercio
    ? "Sin acceso"
    : p.query.error
    ? `No se pudieron cargar ${p.title.toLocaleLowerCase("es")}.`
    : null;
  return (
    <div className="container mx-auto space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            {p.icon}
            {p.title}
          </h1>
          <p className="mt-1 text-muted-foreground">
            {p.comercioNombre
              ? `Comercio activo: ${p.comercioNombre}`
              : `${p.title} del comercio activo`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {allowed && (
            <Badge variant="outline">
              {p.access.isAdmin ? "Administrador" : "Solo lectura"}
            </Badge>
          )}
          {allowed && p.access.isAdmin && (
            <Button
              variant="new"
              onClick={() => setCreating(true)}
            >
              <Plus className="h-4 w-4" />Nuevo {p.singular}
            </Button>
          )}
        </div>
      </div>
      {allowed && p.access.isAdmin && (
        <Dialog
          open={creating || Boolean(editing)}
          onOpenChange={(o) => {
            if (!o) close();
          }}
        >
          <DialogContent
            className="max-h-[90vh] max-w-2xl overflow-y-auto"
            onEscapeKeyDown={(e) => {
              if (saving) e.preventDefault();
            }}
            onInteractOutside={(e) => {
              if (saving) e.preventDefault();
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {editing ? `Editar ${p.singular}` : `Nuevo ${p.singular}`}
              </DialogTitle>
            </DialogHeader>
            {p.renderForm(
              editing ? "edit" : "create",
              editing,
              close,
              setSaving,
            )}
          </DialogContent>
        </Dialog>
      )}
      {allowed && p.access.isAdmin && (
        <AlertDialog
          open={Boolean(status)}
          onOpenChange={(o) => {
            if (!o && !p.setStatus.isPending) setStatus(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {status?.activo
                  ? `¿Desactivar este ${p.singular}?`
                  : `¿Reactivar este ${p.singular}?`}
              </AlertDialogTitle>
              <AlertDialogDescription>
                Permanecerá guardado y visible mediante el filtro
                correspondiente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={p.setStatus.isPending}>
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={p.setStatus.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  void confirm();
                }}
              >
                {p.setStatus.isPending
                  ? "Guardando..."
                  : status?.activo
                  ? "Desactivar"
                  : "Reactivar"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {allowed && (
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1 sm:max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              aria-label={p.searchLabel}
              placeholder={p.searchLabel}
              className="pl-9"
            />
          </div>
          <Select
            value={filter}
            onValueChange={(v) => setFilter(v as CampoEstadoFilter)}
          >
            <SelectTrigger
              className="sm:w-44"
              aria-label={`Filtrar ${
                p.title.toLocaleLowerCase("es")
              } por estado`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="activos">Activos</SelectItem>
              <SelectItem value="inactivos">Inactivos</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      {loading
        ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Cargando...
            </CardContent>
          </Card>
        )
        : message
        ? (
          <Card>
            <CardContent
              className={`py-12 text-center ${
                p.access.error || p.query.error
                  ? "text-destructive"
                  : "text-muted-foreground"
              }`}
            >
              {message}
            </CardContent>
          </Card>
        )
        : rows.length === 0
        ? (
          <Card>
            <CardContent className="py-12 text-center">
              <h2 className="font-semibold">
                No se encontraron {p.title.toLocaleLowerCase("es")}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {term || filter !== "todos"
                  ? "Probá con otros filtros de búsqueda."
                  : "Todavía no hay registros disponibles."}
              </p>
            </CardContent>
          </Card>
        )
        : (
          <>
            <div className="grid gap-4 md:hidden">
              {rows.map((x) => (
                <Card key={x.id}>
                  <CardHeader>
                    <div className="flex justify-between gap-3">
                      <CardTitle>{x.nombre}</CardTitle>
                      <Badge variant={x.activo ? "default" : "secondary"}>
                        {x.activo ? "Activo" : "Inactivo"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {x.codigo_interno || "Sin código interno"}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {p.cells(x).map((c, i) => (
                      <div key={p.headers[i]}>
                        <span className="block text-xs text-muted-foreground">
                          {p.headers[i]}
                        </span>
                        {c}
                      </div>
                    ))}
                    {p.access.isAdmin && (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditing(x)}
                        >
                          <Pencil className="h-4 w-4" />Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setStatus(x)}
                        >
                          {x.activo
                            ? <PowerOff className="h-4 w-4" />
                            : <Power className="h-4 w-4" />}
                          {x.activo ? "Desactivar" : "Reactivar"}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card className="hidden md:block">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Código</TableHead>
                      {p.headers.map((h) => <TableHead key={h}>{h}</TableHead>)}
                      <TableHead>Estado</TableHead>
                      {p.access.isAdmin && (
                        <TableHead className="text-right">Acciones</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((x) => (
                      <TableRow key={x.id}>
                        <TableCell className="font-medium">
                          {x.nombre}
                        </TableCell>
                        <TableCell>{x.codigo_interno || "—"}</TableCell>
                        {p.cells(x).map((c, i) => (
                          <TableCell key={p.headers[i]}>{c}</TableCell>
                        ))}
                        <TableCell>
                          <Badge variant={x.activo ? "default" : "secondary"}>
                            {x.activo ? "Activo" : "Inactivo"}
                          </Badge>
                        </TableCell>
                        {p.access.isAdmin && (
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditing(x)}
                              >
                                Editar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setStatus(x)}
                              >
                                {x.activo ? "Desactivar" : "Reactivar"}
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
    </div>
  );
}
