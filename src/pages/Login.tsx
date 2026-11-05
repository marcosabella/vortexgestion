import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, ArrowUpRight, Eye, EyeOff, Loader2, LockKeyhole, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import "./Login.css";

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
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [comercio, setComercio] = useState<ComercioLoginData | null>(null);
  const [isComercioLoading, setIsComercioLoading] = useState(Boolean(comercioId));

  const redirectTo = useMemo(() => {
    const state = location.state as LoginLocationState | null;
    // /inicio redirige internamente a Caja cuando el administrador no habilitó el inicio operativo.
    return state?.from?.pathname && state.from.pathname !== "/login" ? state.from.pathname : "/inicio";
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
    setLoginError("");
    setIsSubmitting(true);
    localStorage.removeItem("selectedComercioId");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setIsSubmitting(false);

    if (error) {
      setLoginError("Revisá el email y la contraseña e intentá nuevamente.");
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

  const comercioName = comercio?.nombre_comercio ?? "Vortex Gestión";
  const comercioLocation = comercio ? [comercio.localidad, comercio.provincia].filter(Boolean).join(", ").toLocaleUpperCase("es-AR") : "Tu espacio de trabajo";

  return (
    <main className="vortex-login">
      <div className="login-background-art" aria-hidden="true">
        <svg className="login-decoration login-decoration-top" viewBox="0 0 520 520" fill="none">
          <circle cx="260" cy="260" r="180" />
          <circle cx="260" cy="260" r="218" />
          <circle cx="260" cy="260" r="256" />
          <path d="M75 445 445 75" />
          <circle className="login-decoration-node" cx="414" cy="106" r="4" />
          <circle className="login-decoration-node" cx="80" cy="260" r="3" />
        </svg>
        <svg className="login-decoration login-decoration-bottom" viewBox="0 0 600 600" fill="none">
          <ellipse cx="300" cy="300" rx="270" ry="170" transform="rotate(-32 300 300)" />
          <ellipse cx="300" cy="300" rx="270" ry="208" transform="rotate(-32 300 300)" />
          <ellipse cx="300" cy="300" rx="270" ry="246" transform="rotate(-32 300 300)" />
          <circle className="login-decoration-node" cx="530" cy="176" r="4" />
          <circle className="login-decoration-node" cx="92" cy="440" r="3" />
        </svg>
        <span className="login-decoration-cross login-decoration-cross-one" />
        <span className="login-decoration-cross login-decoration-cross-two" />
        <span className="login-decoration-square" />
      </div>
      <div className="login-content">
      <section className="login-access" aria-labelledby="login-title">
        <header className="login-header">
          <h1 id="login-title">BIENVENIDO A</h1>
          <div className="login-wordmark"><img src="/logo.png" alt="Vortex, tu negocio en movimiento" /></div>
        </header>
        <div className="login-form-wrap">
          {comercioId && <div className="login-commerce" aria-live="polite">
            {comercio?.logo_url ? <img src={comercio.logo_url} alt="" /> : <span className="login-commerce-icon"><LockKeyhole size={18} /></span>}
            <div><strong>{isComercioLoading ? "Cargando comercio…" : comercioName}</strong><span>{comercioLocation}</span></div>
          </div>}

          <form className="login-form" onSubmit={handleSubmit} aria-busy={isSubmitting}>
            <div className="login-field">
              <Label htmlFor="email">Email</Label>
              <div className="login-input-wrap">
                <Mail className="login-input-icon" size={18} aria-hidden="true" />
                <Input id="email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
                  placeholder="nombre@tucomercio.com" value={email} onChange={event => setEmail(event.target.value)}
                  aria-invalid={Boolean(loginError)} aria-describedby={loginError ? "login-error" : undefined} required />
              </div>
            </div>
            <div className="login-field">
              <Label htmlFor="password">Contraseña</Label>
              <div className="login-input-wrap">
                <LockKeyhole className="login-input-icon" size={18} aria-hidden="true" />
                <Input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password"
                  placeholder="Ingresá tu contraseña" value={password} onChange={event => setPassword(event.target.value)}
                  aria-invalid={Boolean(loginError)} aria-describedby={loginError ? "login-error" : undefined} required />
                <button className="login-password-toggle" type="button" onClick={() => setShowPassword(value => !value)}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={showPassword}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            {loginError && <p id="login-error" className="login-error" role="alert">{loginError}</p>}
            <Button type="submit" className="login-submit" disabled={isSubmitting || isLoading}>
              {isSubmitting ? <><Loader2 className="animate-spin" size={18} /> Ingresando…</> : <>Ingresar <ArrowRight size={18} /></>}
            </Button>
          </form>
        </div>
      </section>
      <footer className="login-footer">
        <Link to="/" className="login-landing-link">Conocé Vortex Gestión <ArrowUpRight size={14} aria-hidden="true" /></Link>
        <p><span>VORTEX GESTIÓN</span><span aria-hidden="true"> — </span>© 2026 Marcos Abella</p>
      </footer>
      </div>
    </main>
  );
}
