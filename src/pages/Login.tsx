import { FormEvent, useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { LockKeyhole, LogIn, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

type LoginLocationState = {
  from?: {
    pathname?: string;
  };
};

type ComercioLoginData = {
  id: string;
  nombre_comercio: string;
  localidad: string;
  provincia: string;
  logo_url: string | null;
};

export default function Login() {
  const { comercioId } = useParams();
  const { session, isLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [comercio, setComercio] = useState<ComercioLoginData | null>(null);
  const [isComercioLoading, setIsComercioLoading] = useState(Boolean(comercioId));

  const redirectTo = useMemo(() => {
    const state = location.state as LoginLocationState | null;
    return state?.from?.pathname && state.from.pathname !== "/login" ? state.from.pathname : "/caja";
  }, [location.state]);

  useEffect(() => {
    if (!comercioId) {
      setComercio(null);
      setIsComercioLoading(false);
      return;
    }

    setIsComercioLoading(true);

    supabase
      .rpc("get_comercio_login", { target_comercio_id: comercioId })
      .then(({ data, error }) => {
        if (error) {
          toast({
            title: "No se pudo cargar el comercio",
            description: error.message,
            variant: "destructive",
          });
        }

        setComercio(data?.[0] ?? null);
        setIsComercioLoading(false);
      });
  }, [comercioId, toast]);

  if (!isLoading && session) {
    return <Navigate to={redirectTo} replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setIsSubmitting(false);

    if (error) {
      toast({
        title: "No se pudo iniciar sesion",
        description: "Revise el email y la contrasena ingresados.",
        variant: "destructive",
      });
      return;
    }

    if (comercioId) {
      localStorage.setItem("selectedComercioId", comercioId);
    } else {
      localStorage.removeItem("selectedComercioId");
    }

    navigate(redirectTo, { replace: true });
  };

  const comercioName = comercio?.nombre_comercio ?? "VORTEX";
  const comercioLocation = comercio ? `${comercio.localidad}, ${comercio.provincia}` : "Gestion comercial multi comercio";

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="grid min-h-screen lg:grid-cols-[1fr_460px]">
        <section className="flex min-h-[320px] flex-col justify-between bg-[linear-gradient(135deg,#0f172a_0%,#164e63_52%,#f59e0b_100%)] p-8 sm:p-10 lg:p-12">
          <div className="flex items-center gap-4">
            <div className="flex h-24 w-24 items-center justify-center rounded-md bg-white/15 ring-1 ring-white/25">
              <img src="/logo.png" alt="VORTEX" className="h-20 w-20 object-contain" />
            </div>
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-white/70">Acceso comercio</p>
              <h1 className="text-2xl font-semibold">{comercioName}</h1>
            </div>
          </div>

          <div className="max-w-2xl">
            <p className="mb-4 text-sm font-medium uppercase tracking-[0.2em] text-amber-200">Panel privado</p>
            <h2 className="max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">
              Ventas, clientes, productos y cuenta corriente para cada negocio.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-white/78">
              Cada comercio ingresa con su usuario para trabajar sobre sus registros operativos.
            </p>
          </div>

          <div className="grid gap-3 text-sm text-white/80 sm:grid-cols-3">
            <div className="border-t border-white/25 pt-3">Ventas</div>
            <div className="border-t border-white/25 pt-3">Clientes</div>
            <div className="border-t border-white/25 pt-3">Stock</div>
          </div>
        </section>

        <section className="flex items-center justify-center bg-background px-5 py-10 text-foreground">
          <Card className="w-full max-w-sm rounded-lg shadow-lg">
            <CardHeader className="space-y-4">
              <div className="flex items-center gap-3">
                {comercio?.logo_url ? (
                  <img
                    src={comercio.logo_url}
                    alt={comercio.nombre_comercio}
                    className="h-12 w-12 rounded-md border object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-md border bg-background">
                    <img src="/logo.png" alt="VORTEX" className="h-9 w-9 object-contain" />
                  </div>
                )}
                <div className="min-w-0">
                  <CardTitle className="truncate text-xl">
                    {isComercioLoading ? "Cargando comercio" : comercioName}
                  </CardTitle>
                  <CardDescription className="truncate">{comercioLocation}</CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              <form className="space-y-5" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      className="pl-9"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Contrasena</Label>
                  <div className="relative">
                    <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      autoComplete="current-password"
                      className="pl-9"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                    />
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={isSubmitting || isLoading}>
                  <LogIn className="h-4 w-4" />
                  {isSubmitting ? "Ingresando..." : "Ingresar"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
