import { cloneElement, isValidElement, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function RestauranteGrilla({ columnas, children, vacia, label, compacta = false, ajustada = false }: {
  columnas: { titulo: string; derecha?: boolean; ancho?: string }[]; children: ReactNode; vacia?: string; label: string; compacta?: boolean; ajustada?: boolean;
}) {
  return <div className="min-w-0 rounded-md border bg-card"><Table aria-label={label} className={ajustada ? "table-fixed [&_th]:px-2 [&_td]:px-2 [&_td]:whitespace-normal [&_td]:break-words [&_td]:[overflow-wrap:anywhere]" : compacta ? "min-w-[640px] table-fixed lg:min-w-0 [&_th]:px-2 [&_td]:px-2 [&_td]:whitespace-normal [&_td]:break-words [&_td]:[overflow-wrap:anywhere]" : undefined}>
    <TableHeader><TableRow>{columnas.map(c => <TableHead key={c.titulo} style={c.ancho ? { width: c.ancho } : undefined} className={`${compacta || ajustada ? "whitespace-normal break-words" : "whitespace-nowrap"} ${c.derecha ? "text-right" : ""}`}>{c.titulo}</TableHead>)}</TableRow></TableHeader>
    <TableBody>{vacia ? <TableRow><TableCell colSpan={columnas.length} className="h-24 text-center text-muted-foreground">{vacia}</TableCell></TableRow> : children}</TableBody>
  </Table></div>;
}

export function RestauranteAccion({ icon: Icon, children, asChild, compacta = false, ...props }: ButtonProps & { icon: LucideIcon; compacta?: boolean }) {
  const icono = <Icon className="h-4 w-4" />;
  const etiqueta = isValidElement<{ children?: ReactNode }>(children) ? children.props.children : children;
  const texto = compacta ? <span className="sr-only">{etiqueta}</span> : etiqueta;
  const contenido = asChild && isValidElement<{ children?: ReactNode }>(children)
    ? cloneElement(children, {}, <>{icono}{texto}</>)
    : <>{icono}{texto}</>;
  return <Button type="button" size="sm" variant="outline" asChild={asChild} title={compacta && typeof etiqueta === "string" ? etiqueta : undefined} className={compacta ? "h-9 w-9 shrink-0 px-0" : undefined} {...props}>{contenido}</Button>;
}
