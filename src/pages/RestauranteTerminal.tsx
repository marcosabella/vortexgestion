import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { restaurantePinRequest, restauranteTerminalKey, useRestauranteTerminalAcceso } from "@/hooks/useRestaurantePin";
import { useComercio } from "@/hooks/useComercio";
import { useComercioParametrizacion } from "@/hooks/useComercioParametrizacion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, ChevronDown, Loader2, LockKeyhole, Monitor, UserRound, UtensilsCrossed } from "lucide-react";

type Info = { nombre: string; usuarios: { id: string; nombre: string }[] };
export default function RestauranteTerminal() {
  const { session, isLoading } = useAuth();
  const { comercio, isLoading: comercioLoading } = useComercio();
  const parametrizacion = useComercioParametrizacion();
  const restauranteHabilitado = Boolean(comercio && parametrizacion.data.modulos.restaurante);
  const terminalAcceso = useRestauranteTerminalAcceso(comercio?.id, restauranteHabilitado && Boolean(session));
  const terminalPermitida = restauranteHabilitado && !terminalAcceso.isError
    && terminalAcceso.data?.comercio_id === comercio?.id;
  const navigate = useNavigate();
  const [token] = useState(() => localStorage.getItem(restauranteTerminalKey));
  const [usuario, setUsuario] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const info = useQuery({ queryKey: ["restaurante-terminal-publica"], enabled: Boolean(token) && !session && !isLoading, staleTime: 0, gcTime: 0, retry: false, queryFn: () => restaurantePinRequest<Info>({ action: "listar", token }) });
  async function salir() {
    if (!terminalPermitida) return;
    setBusy(true); setError("");
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); setPin(""); }
  }
  async function ingresar() {
    if (session || isLoading || !token) return;
    setBusy(true); setError("");
    try {
      const login = await restaurantePinRequest<{ access_token: string; refresh_token: string; comercio_id: string }>({ action: "ingresar", token, usuario_id: usuario, pin });
      const { error } = await supabase.auth.setSession({ access_token: login.access_token, refresh_token: login.refresh_token });
      if (error) throw error;
      navigate("/restaurante", { replace: true });
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); setPin(""); }
  }
  if (isLoading || (session && (comercioLoading || parametrizacion.isFetching || (token && restauranteHabilitado && terminalAcceso.isPending)))) {
    return <main className="flex min-h-screen items-center justify-center p-6" role="status">Verificando acceso…</main>;
  }
  if (session && !terminalPermitida) {
    return <main className="flex min-h-screen items-center justify-center p-6"><div className="grid max-w-md gap-4" role="alert"><h1 className="text-xl font-semibold">Acceso no permitido</h1><p>El comercio activo no tiene acceso a esta terminal de restaurante.</p><Button asChild><Link to="/inicio">Volver a mi comercio</Link></Button></div></main>;
  }
  return <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-8 sm:px-8">
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_15%_20%,#164e63_0%,transparent_55%),radial-gradient(ellipse_at_90%_90%,#78350f_0%,transparent_45%)]" />
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:64px_64px]" />
    <div className="grid w-full max-w-5xl items-center gap-8 lg:grid-cols-[1fr_440px] lg:gap-16">
      <section className="text-white">
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10"><img src="/logo.png" alt="Vortex" className="h-11 w-11 object-contain" /></div>
          <div><p className="text-lg font-semibold tracking-wide">VORTEX</p><p className="text-sm text-cyan-100/70">Restaurante</p></div>
        </div>
        <div className="mt-10 hidden lg:block">
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-200/20 bg-amber-200/10 px-3 py-1.5 text-xs font-medium text-amber-200"><UtensilsCrossed aria-hidden="true" className="h-3.5 w-3.5" /> Terminal de trabajo</span>
          <h2 className="mt-6 text-5xl font-semibold leading-tight tracking-tight">Todo listo para<br />un nuevo servicio.</h2>
          <p className="mt-5 max-w-sm text-base leading-7 text-slate-300">Ingresá con tu nombre y PIN para continuar con la atención del restaurante.</p>
          <div className="mt-10 flex items-center gap-3 border-t border-white/10 pt-5 text-sm text-slate-300"><Monitor aria-hidden="true" className="h-5 w-5 text-cyan-200" /> Un equipo compartido. Tu propio acceso.</div>
        </div>
      </section>
      <section aria-labelledby="terminal-titulo" className="w-full min-w-0 overflow-hidden rounded-3xl border border-white/15 bg-background text-foreground shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <div className="h-1.5 bg-gradient-to-r from-cyan-700 via-cyan-500 to-amber-400" />
        <div className="grid gap-6 p-6 sm:p-8">
          <div>
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-600 dark:text-cyan-300"><UtensilsCrossed aria-hidden="true" className="h-6 w-6" /></div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Acceso del equipo</p>
            <h1 id="terminal-titulo" className="break-words text-2xl font-semibold tracking-tight">{info.data?.nombre || "Terminal compartida"}</h1>
            {!session && <p className="mt-2 text-sm leading-6 text-muted-foreground">Elegí tu usuario e ingresá tu PIN para comenzar.</p>}
          </div>
    {isLoading ? <p>Cargando sesión…</p> : session ? <><p>Sesión actual: {session.user.email}. Cerrá esta sesión para que ingrese otro empleado.</p><Button disabled={busy} onClick={() => void salir()}>Cerrar sesión y elegir empleado</Button><Button variant="outline" asChild><Link to="/restaurante">Volver al restaurante</Link></Button></> : !token ? <p>Este navegador no está habilitado. Ingresá como administrador y habilitalo desde Restaurante → Configuración → Usuarios.</p> : info.isPending ? <p>Cargando empleados…</p> : info.error ? <div role="alert" className="grid gap-3"><p>{info.error.message}</p><Button disabled={info.isFetching} variant="outline" onClick={() => void info.refetch()}>Reintentar</Button></div> : <>
      <form className="grid gap-5" onSubmit={e => { e.preventDefault(); void ingresar(); }}>
        <div className="grid gap-2">
          <Label htmlFor="terminal-empleado">Empleado</Label>
          <div className="relative">
            <UserRound aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <select id="terminal-empleado" required disabled={busy} className="h-14 w-full appearance-none rounded-xl border border-input bg-muted/30 pl-12 pr-10 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50" value={usuario} onChange={e => { setUsuario(e.target.value); setPin(""); setError(""); }}><option value="">Elegí tu nombre</option>{info.data?.usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select>
            <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="terminal-pin">PIN de 6 dígitos</Label>
          <div className="relative">
            <LockKeyhole aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input id="terminal-pin" className="h-14 rounded-xl bg-muted/30 pl-12 text-xl tracking-[0.35em] placeholder:tracking-[0.2em]" placeholder="••••••" type="password" inputMode="numeric" autoComplete="off" required pattern="[0-9]{6}" minLength={6} maxLength={6} disabled={busy} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ""))} />
          </div>
        </div>
        <Button className="min-h-14 w-full gap-2 rounded-xl bg-cyan-800 text-base text-white shadow-md hover:bg-cyan-900 dark:bg-cyan-700 dark:hover:bg-cyan-800" disabled={busy || !usuario || pin.length !== 6}>{busy ? <><Loader2 aria-hidden="true" className="h-5 w-5 animate-spin motion-reduce:animate-none" />Ingresando…</> : <>Ingresar<ArrowRight aria-hidden="true" className="h-5 w-5" /></>}</Button>
      </form>
      {!info.data?.usuarios.length && <p>No hay empleados con PIN habilitado. Consultá al administrador.</p>}
    </>}
    {error && <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
    {!session && <div className="border-t pt-5 text-center"><Link className="inline-flex min-h-11 items-center justify-center rounded-md px-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" to="/login">Ingresar con email y contraseña</Link></div>}
        </div>
      </section>
    </div>
  </main>;
}
