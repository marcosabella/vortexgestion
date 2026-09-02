import { Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { OrdenLaborLotesList } from "@/components/campo/OrdenLaborLotesList";
import type { CampoOrdenDetail, CampoOrdenLaborListItem, CampoOrdenLaborUnidad } from "@/types/campo";

const unidadLabels: Record<CampoOrdenLaborUnidad, string> = {
  ha: "Hectáreas",
  hora: "Horas",
  km: "Kilómetros",
  tonelada: "Toneladas",
  unidad: "Unidades",
  fijo: "Fijo por lote",
};

function unidadLabel(value: string) {
  return unidadLabels[value as CampoOrdenLaborUnidad] ?? value;
}

type OrdenLaboresListProps = {
  comercioId: string;
  ordenId: string;
  hasAccess: boolean;
  isAdmin: boolean;
  orden: CampoOrdenDetail;
  labores: CampoOrdenLaborListItem[];
};

export function OrdenLaboresList({ comercioId, ordenId, hasAccess, isAdmin, orden, labores }: OrdenLaboresListProps) {
  if (labores.length === 0) return <p className="py-8 text-center text-muted-foreground">Esta orden todavía no tiene labores.</p>;

  return (
    <>
      <div className="grid gap-4 md:hidden">
        {labores.map((labor) => (
          <Card key={labor.id}>
            <CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><CardTitle className="text-base">{labor.nombre}</CardTitle><Badge variant={labor.activo ? "default" : "secondary"}>{labor.activo ? "Activa" : "Inactiva"}</Badge></div></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="block text-muted-foreground">Código</span>{labor.codigo_interno || "Sin código"}</div>
              <div><span className="block text-muted-foreground">Unidad</span>{unidadLabel(labor.unidad)}</div>
              <div><span className="block text-muted-foreground">Posición</span>{labor.posicion}</div>
              <div className="col-span-2"><span className="block text-muted-foreground">Descripción</span><p className="whitespace-pre-wrap">{labor.descripcion || "Sin descripción"}</p></div>
              <div className="col-span-2"><OrdenLaborLotesList comercioId={comercioId} ordenId={ordenId} hasAccess={hasAccess} isAdmin={isAdmin} orden={orden} labor={labor} /></div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="hidden md:block">
        <Table>
          <TableHeader><TableRow><TableHead>Posición</TableHead><TableHead>Nombre</TableHead><TableHead>Código</TableHead><TableHead>Unidad</TableHead><TableHead>Descripción</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader>
          <TableBody>{labores.map((labor) => (
            <Fragment key={labor.id}>
              <TableRow><TableCell>{labor.posicion}</TableCell><TableCell className="font-medium">{labor.nombre}</TableCell><TableCell>{labor.codigo_interno || "Sin código"}</TableCell><TableCell>{unidadLabel(labor.unidad)}</TableCell><TableCell className="max-w-sm whitespace-pre-wrap">{labor.descripcion || "Sin descripción"}</TableCell><TableCell><Badge variant={labor.activo ? "default" : "secondary"}>{labor.activo ? "Activa" : "Inactiva"}</Badge></TableCell></TableRow>
              <TableRow><TableCell colSpan={6} className="bg-muted/10"><OrdenLaborLotesList comercioId={comercioId} ordenId={ordenId} hasAccess={hasAccess} isAdmin={isAdmin} orden={orden} labor={labor} /></TableCell></TableRow>
            </Fragment>
          ))}</TableBody>
        </Table>
      </div>
    </>
  );
}
