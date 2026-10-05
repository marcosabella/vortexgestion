import type { ReactNode } from 'react';
import { Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ESTADOS_TALLER, type EstadoTaller } from '@/types/taller';
import { tallerError, useTaller } from '@/hooks/useTaller';

export type TallerData = ReturnType<typeof useTaller>;
export function TallerEstado({ estado }: { estado: EstadoTaller }) {
  return <Badge className="whitespace-nowrap" variant={estado === 'cancelado' ? 'destructive' : ['listo', 'entregado'].includes(estado) ? 'success' : ['aprobado', 'en_reparacion'].includes(estado) ? 'default' : 'secondary'}>{ESTADOS_TALLER[estado]}</Badge>;
}
export function TallerCampo({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-2 text-sm"><span className="font-medium">{label}</span>{children}</label>;
}
export const tallerSelectClass = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';
export function TallerLayout({ data, children }: { data: TallerData; children: ReactNode }) {
  return <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
    <div><h1 className="flex items-center gap-2 text-2xl font-bold md:text-3xl"><Wrench className="h-7 w-7" />Vortex Taller</h1><p className="mt-1 text-muted-foreground">Vehículos, trabajos y servicios de {data.comercio?.nombre_comercio || 'tu comercio'}.</p></div>
    {data.isLoading ? <p role="status">Cargando taller...</p> : data.error ? <div role="alert" className="space-y-3 rounded-lg border p-4"><p>{tallerError(data.error)}</p><Button variant="outline" onClick={() => data.refetch()}>Volver a consultar</Button></div> : <>
      {!data.isAdmin && <p className="text-sm text-muted-foreground">Acceso de consulta. Un administrador del comercio puede gestionar los trabajos.</p>}
      {children}
    </>}
  </div>;
}
export function TallerEmpty({ children }: { children: ReactNode }) { return <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">{children}</p>; }
export function TallerSectionTitle({ title, children }: { title: string; children?: ReactNode }) { return <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">{title}</h2>{children}</div>; }
export function TallerReadOnlyField({ label, value }: { label: string; value: string }) { return <div><Label>{label}</Label><p className="mt-1 whitespace-pre-wrap text-sm">{value || '—'}</p></div>; }
