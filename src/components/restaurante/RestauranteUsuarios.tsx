import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useComercio } from "@/hooks/useComercio";
import { useToast } from "@/hooks/use-toast";
import { useRestauranteUsuarios, type UsuarioRestaurante } from "@/hooks/useRestauranteUsuarios";
import { restauranteRoles } from "@/config/restauranteRoles";
import type { ResumenRestaurante } from "@/types/restaurante";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TableCell, TableRow } from "@/components/ui/table";
import { RestauranteGrilla } from "./RestauranteGrilla";
import { RestaurantePin } from "./RestaurantePin";

const schema = z.object({ nombre: z.string().trim().min(1, "Ingresá un nombre").max(100), email: z.string().trim().email("Ingresá un email válido"), password: z.string().max(128), roles: z.array(z.enum(["mozo", "repartidor", "cocina", "barra"])).min(1, "Seleccioná una función"), sector_id: z.string(), cobros: z.boolean(), activo: z.boolean() }).superRefine((v, ctx) => {
  if (v.roles.some(r => r === "cocina" || r === "barra") && (v.roles.length !== 1 || !v.sector_id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sector_id"], message: "Cocina o barra requieren un único rol y un sector de preparación." });
  if (v.password && v.password.length < 8) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["password"], message: "La contraseña debe tener al menos 8 caracteres." });
});
type Values = z.infer<typeof schema>;
const defaults: Values = { nombre: "", email: "", password: "", roles: [], sector_id: "", cobros: false, activo: true };
export function RestauranteUsuarios({ data }: { data: ResumenRestaurante }) {
  const { comercio } = useComercio();
  const { query, mutation } = useRestauranteUsuarios(comercio?.id);
  const { toast } = useToast();
  const [editando, setEditando] = useState<UsuarioRestaurante | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  const roles = form.watch("roles");
  const preparacion = roles.some(r => r === "cocina" || r === "barra");
  const nuevo = () => { setEditando(null); form.reset(defaults); };
  const editar = (u: UsuarioRestaurante) => { setEditando(u); form.reset({ nombre: u.nombre, email: u.email, password: "", roles: u.roles, sector_id: u.sector_id || "", cobros: u.permisos.includes("cobros"), activo: u.activo }); };
  async function ejecutar(values: Record<string, unknown>, mensaje: string) {
    try { await mutation.mutateAsync(values); toast({ title: mensaje }); return true; }
    catch (error) { toast({ title: "No se pudo completar", description: (error as Error).message, variant: "destructive" }); return false; }
    finally { mutation.reset(); }
  }
  return <div className="grid gap-6">
    <section className="rounded-xl border p-4">
      <h2 className="mb-2 text-lg font-semibold">Usuarios y roles</h2>
      <p className="mb-4 text-sm text-muted-foreground">Cada persona ingresa con su email y contraseña. Las cuentas nuevas tienen acceso exclusivo a Restaurante. Las cuentas existentes conservan sus accesos. El administrador del comercio conserva todas las funciones y realiza los cierres.</p>
      {query.isPending ? <p>Cargando usuarios…</p> : query.error ? <div role="alert"><p>{query.error.message}</p><Button onClick={() => void query.refetch()}>Reintentar</Button></div> :
        <RestauranteGrilla label="Usuarios del restaurante" columnas={[{ titulo: "Persona" }, { titulo: "Roles / sector" }, { titulo: "Estado" }, { titulo: "Acciones" }]}>
          {query.data?.map(u => <TableRow key={u.id}><TableCell><p className="font-medium">{u.nombre}</p><p className="text-sm">{u.email}</p><p className="text-xs text-muted-foreground">{u.solo_restaurante ? "Sólo Restaurante" : "Cuenta existente de Vortex"}</p></TableCell><TableCell>{u.admin ? "Administrador" : u.roles.map(r => restauranteRoles.find(x => x.id === r)?.nombre).join(", ") || "Funciones personalizadas / sin asignar"}{u.sector_id && <p>{data.sectores.find(s => s.id === u.sector_id)?.nombre}</p>}</TableCell><TableCell>{u.admin ? "Administrador" : u.activo ? "Activo" : "Sin acceso a Restaurante"}</TableCell><TableCell>{!u.admin && <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={mutation.isPending} onClick={() => editar(u)}>Editar acceso</Button></div>}</TableCell></TableRow>)}
        </RestauranteGrilla>}
    </section>
    <section className="rounded-xl border p-4">
      <h2 className="mb-4 text-lg font-semibold">{editando ? `Editar: ${editando.nombre}` : "Crear usuario"}</h2>
      <form className="grid gap-4" onSubmit={form.handleSubmit(async values => {
        if (!editando && values.password.length < 8) { form.setError("password", { message: "Definí una contraseña de al menos 8 caracteres." }); return; }
        const ok = await ejecutar({ ...values, password: !editando || editando.solo_restaurante ? values.password : "", action: editando ? "guardar" : "crear", usuario_id: editando?.id, sector_id: preparacion ? values.sector_id : null, cobros: values.roles.includes("mozo") && values.cobros }, editando ? "Acceso actualizado" : "Usuario creado. Ya puede ingresar con su email y contraseña.");
        if (ok) nuevo();
      })}>
        <div className="grid gap-2"><Label htmlFor="restaurante-nombre">Nombre</Label><Input id="restaurante-nombre" {...form.register("nombre")} /></div>
        <div className="grid gap-2"><Label htmlFor="restaurante-email">Email de ingreso</Label><Input id="restaurante-email" type="email" readOnly={Boolean(editando)} {...form.register("email")} /></div>
        {(!editando || editando.solo_restaurante) && <div className="grid gap-2"><Label htmlFor="restaurante-password">{editando ? "Nueva contraseña (opcional)" : "Contraseña de ingreso"}</Label><Input id="restaurante-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required={!editando} {...form.register("password")} /><p className="text-sm text-muted-foreground">{editando ? "Dejá vacío para conservar la contraseña actual." : "El usuario puede ingresar directamente. No se envían emails de confirmación."}</p></div>}
        <fieldset className="grid gap-2"><legend className="mb-2 font-medium">Funciones</legend>{restauranteRoles.map(r => <label key={r.id} className="flex min-h-11 items-center gap-2"><input type="checkbox" value={r.id} {...form.register("roles")} />{r.nombre}</label>)}</fieldset>
        {preparacion && <div className="grid gap-2"><Label htmlFor="restaurante-sector">Sector de preparación</Label><select id="restaurante-sector" className="min-h-11 rounded-md border bg-background px-3" {...form.register("sector_id")}><option value="">Seleccioná el sector</option>{data.sectores.filter(s => s.activo).map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></div>}
        {roles.includes("mozo") && <label className="flex min-h-11 items-center gap-2"><input type="checkbox" {...form.register("cobros")} />Permitir cobros al mozo / moza</label>}
        {editando && <label className="flex min-h-11 items-center gap-2"><input type="checkbox" {...form.register("activo")} />Acceso activo a Restaurante (se conserva el historial)</label>}
        {Object.entries(form.formState.errors).map(([key, error]) => <p key={key} role="alert" className="text-sm text-destructive">{error.message}</p>)}
        <p className="text-sm text-muted-foreground">El repartidor opera sus envíos y puede registrar sus cobros autorizados. Cocina y Barra se asignan por separado a un sector para limitar sus comandas. Mozo y Repartidor pueden combinarse.</p>
        <div className="flex flex-wrap gap-2"><Button disabled={mutation.isPending || query.isError}>{mutation.isPending ? "Guardando…" : editando ? "Guardar acceso" : "Crear usuario"}</Button>{editando && <Button type="button" variant="outline" onClick={nuevo}>Cancelar edición</Button>}</div>
      </form>
    </section>
    {query.data && <RestaurantePin usuarios={query.data} />}
  </div>;
}
