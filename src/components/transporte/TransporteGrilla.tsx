import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type TransporteFila = { id: string; celdas: ReactNode[]; acciones?: ReactNode };

export function TransporteGrilla({ titulo, columnas, filas, acciones = false, vacio = 'No hay registros para esta consulta.' }: {
  titulo: string;
  columnas: string[];
  filas: TransporteFila[];
  acciones?: boolean;
  vacio?: string;
}) {
  return <Card className="min-w-0 max-w-full"><CardContent className="p-0">
    <Table aria-label={titulo}>
      <TableHeader><TableRow>
        {columnas.map(columna => <TableHead key={columna} scope="col">{columna}</TableHead>)}
        {acciones && <TableHead scope="col" className="sticky right-0 z-10 bg-card text-right">Acciones</TableHead>}
      </TableRow></TableHeader>
      <TableBody>
        {filas.map(fila => <TableRow key={fila.id}>
          {fila.celdas.map((celda, indice) => <TableCell key={columnas[indice]} className={indice === 0 ? 'font-medium' : undefined}>{celda ?? '—'}</TableCell>)}
          {acciones && <TableCell className="sticky right-0 z-10 bg-card text-right"><div className="flex items-center justify-end gap-2">{fila.acciones}</div></TableCell>}
        </TableRow>)}
        {!filas.length && <TableRow><TableCell colSpan={columnas.length + Number(acciones)} className="h-24 text-center text-muted-foreground">{vacio}</TableCell></TableRow>}
      </TableBody>
    </Table>
  </CardContent></Card>;
}
