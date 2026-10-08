import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { restaurantePinRequest, restauranteTerminalKey } from "@/hooks/useRestaurantePin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Info = { nombre: string; usuarios: { id: string; nombre: string }[] };
export default function RestauranteTerminal() {
  const { session, isLoading } = useAuth();
  const navigate = useNavigate();
  const [token] = useState(() => localStorage.getItem(restauranteTerminalKey));
  const [usuario, setUsuario] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const info = useQuery({ queryKey: ["restaurante-terminal-publica"], enabled: Boolean(token) && !session && !isLoading, staleTime: 0, gcTime: 0, retry: false, queryFn: () => restaurantePinRequest<Info>({ action: "listar", token }) });
  async function salir() {
    setBusy(true); setError("");
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); setPin(""); }
  }
  async function ingresar() {
    setBusy(true); setError("");
    try {
      const login = await restaurantePinRequest<{ access_token: string; refresh_token: string; comercio_id: string }>({ action: "ingresar", token, usuario_id: usuario, pin });
      const { error } = await supabase.auth.setSession({ access_token: login.access_token, refresh_token: login.refresh_token });
      if (error) throw error;
      navigate("/restaurante", { replace: true });
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); setPin(""); }
  }
  return <main className="flex min-h-screen items-center justify-center bg-muted p-4"><section className="grid w-full max-w-md gap-5 rounded-xl border bg-background p-6 shadow-sm">
    <div><p className="text-sm text-muted-foreground">Vortex Restaurante</p><h1 className="text-2xl font-bold">{info.data?.nombre || "Terminal compartida"}</h1></div>
    {isLoading ? <p>Cargando sesión…</p> : session ? <><p>Sesión actual: {session.user.email}. Cerrá esta sesión para que ingrese otro empleado.</p><Button disabled={busy} onClick={() => void salir()}>Cerrar sesión y elegir empleado</Button><Button variant="outline" asChild><Link to="/restaurante">Volver al restaurante</Link></Button></> : !token ? <p>Este navegador no está habilitado. Ingresá como administrador y habilitalo desde Restaurante → Configuración → Usuarios.</p> : info.isPending ? <p>Cargando empleados…</p> : info.error ? <div role="alert" className="grid gap-3"><p>{info.error.message}</p><Button disabled={info.isFetching} variant="outline" onClick={() => void info.refetch()}>Reintentar</Button></div> : <>
      <form className="grid gap-4" onSubmit={e => { e.preventDefault(); void ingresar(); }}>
        <Label htmlFor="terminal-empleado">Empleado</Label><select id="terminal-empleado" required disabled={busy} className="min-h-12 rounded-md border bg-background px-3" value={usuario} onChange={e => { setUsuario(e.target.value); setPin(""); setError(""); }}><option value="">Elegí tu nombre</option>{info.data?.usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select>
        <Label htmlFor="terminal-pin">PIN de 6 dígitos</Label><Input id="terminal-pin" className="h-12 text-xl" type="password" inputMode="numeric" autoComplete="off" required pattern="[0-9]{6}" minLength={6} maxLength={6} disabled={busy} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ""))} />
        <Button className="min-h-12" disabled={busy || !usuario || pin.length !== 6}>{busy ? "Ingresando…" : "Ingresar"}</Button>
      </form>
      {!info.data?.usuarios.length && <p>No hay empleados con PIN habilitado. Consultá al administrador.</p>}
    </>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {!session && <Link className="text-sm underline" to="/login">Ingresar con email y contraseña</Link>}
  </section></main>;
}
