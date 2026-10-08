import { useState } from "react";
import { Link } from "react-router-dom";
import { useComercio } from "@/hooks/useComercio";
import { useRestaurantePin } from "@/hooks/useRestaurantePin";
import type { UsuarioRestaurante } from "@/hooks/useRestauranteUsuarios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RestaurantePin({ usuarios }: { usuarios: UsuarioRestaurante[] }) {
  const { comercio } = useComercio();
  const { query, mutation } = useRestaurantePin(comercio?.id);
  const [usuario, setUsuario] = useState("");
  const [pin, setPin] = useState("");
  const [nombre, setNombre] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  async function operar(values: Record<string, unknown>, success: string) {
    setError("");
    setMensaje("");
    try { await mutation.mutateAsync(values); setMensaje(success); }
    catch (e) { setError((e as Error).message); }
    finally { setPin(""); mutation.reset(); }
  }
  return <section className="grid gap-4 rounded-xl border p-4">
    <h2 className="text-lg font-semibold">PIN y terminales compartidas</h2>
    <p className="text-sm text-muted-foreground">Asigná un PIN de 6 dígitos a cada empleado y habilitá este navegador desde el equipo que usarán. Elegirán su nombre y PIN para ingresar con sus propios permisos. La terminal vence a los 30 días.</p>
    {query.isPending ? <p>Cargando terminales…</p> : query.error ? <div role="alert"><p>{query.error.message}</p><Button variant="outline" onClick={() => void query.refetch()}>Reintentar</Button></div> : <>
      <form className="grid gap-3 sm:max-w-md" onSubmit={e => { e.preventDefault(); void operar({ action: "guardar_pin", usuario_id: usuario, pin }, "PIN guardado."); }}>
        <Label htmlFor="pin-persona">Empleado</Label>
        <select id="pin-persona" required className="min-h-11 rounded-md border bg-background px-3" value={usuario} onChange={e => { setUsuario(e.target.value); setPin(""); setMensaje(""); setError(""); }}>
          <option value="">Seleccioná una persona</option>
          {usuarios.filter(u => !u.admin && u.solo_restaurante && u.activo).map(u => <option key={u.id} value={u.id}>{u.nombre}{query.data?.usuarios.includes(u.id) ? " · PIN asignado" : ""}</option>)}
        </select>
        <Label htmlFor="pin-nuevo">Nuevo PIN</Label>
        <Input id="pin-nuevo" type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{6}" minLength={6} maxLength={6} required value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ""))} />
        <div className="flex flex-wrap gap-2"><Button disabled={mutation.isPending || !usuario}>Guardar PIN</Button><Button type="button" variant="outline" disabled={mutation.isPending || !usuario || !query.data?.usuarios.includes(usuario)} onClick={() => void operar({ action: "guardar_pin", usuario_id: usuario, pin: null }, "PIN deshabilitado.")}>Deshabilitar PIN</Button></div>
      </form>
      <p className="text-sm text-muted-foreground">El PIN está disponible para operadores con acceso exclusivo a este restaurante. Las cuentas administrativas mantienen el ingreso con email y contraseña.</p>
      <form className="grid gap-3 sm:max-w-md" onSubmit={e => { e.preventDefault(); void operar({ action: "crear_terminal", nombre }, "Este navegador ya está habilitado. Abrí el acceso de terminal para cerrar tu sesión y comenzar."); }}>
        <Label htmlFor="terminal-nombre">Nombre de este equipo</Label><Input id="terminal-nombre" required maxLength={100} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Mostrador / salón" />
        <Button disabled={mutation.isPending || !nombre.trim()}>Habilitar este navegador</Button>
      </form>
      <Button variant="outline" asChild><Link to="/restaurante-terminal">Abrir acceso de terminal</Link></Button>
      <div className="grid gap-2">{query.data?.terminales.map(t => <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-3"><div><p className="font-medium">{t.nombre}</p><p className="text-sm">{t.revocada ? "Revocada" : `Vence: ${new Date(t.vence_at).toLocaleString("es-AR")}`}</p></div>{!t.revocada && <Button variant="outline" disabled={mutation.isPending} onClick={() => void operar({ action: "revocar", id: t.id }, "Terminal revocada para nuevos ingresos.")}>Revocar</Button>}</div>)}</div>
    </>}
    {mensaje && <p role="status">{mensaje}</p>}{error && <p role="alert" className="text-destructive">{error}</p>}
  </section>;
}
