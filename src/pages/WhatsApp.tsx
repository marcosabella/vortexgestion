import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, MessageCircle, Send, ShieldCheck } from "lucide-react";
import { useComercio } from "@/hooks/useComercio";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type MetaLoginResponse = { authResponse?: { code?: string } };
type WhatsAppConnection = {
  estado?: string;
  numero_telefono?: string | null;
  nombre_visible?: string | null;
  plantilla_factura_nombre?: string | null;
  plantilla_factura_estado?: string | null;
};

declare global { interface Window { FB?: { init: (options: Record<string, unknown>) => void; login: (callback: (response: MetaLoginResponse) => void, options: Record<string, unknown>) => void; }; } }

const metaAppId = import.meta.env.VITE_META_APP_ID;
const embeddedSignupConfigId = import.meta.env.VITE_META_WHATSAPP_CONFIG_ID;

const loadFacebookSdk = () => new Promise<void>((resolve, reject) => {
  if (window.FB) return resolve();
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timeoutId);
    if (window.FB) resolve();
    else reject(new Error("El navegador bloqueó el SDK de Meta. Permití rastreadores y ventanas emergentes para este sitio."));
  };
  const fail = () => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timeoutId);
    reject(new Error("No se pudo cargar el acceso de Meta. Revisá la conexión y los bloqueadores del navegador."));
  };
  const timeoutId = window.setTimeout(fail, 15000);
  const existing = document.getElementById("facebook-jssdk");
  if (existing) {
    existing.addEventListener("load", finish, { once: true });
    existing.addEventListener("error", fail, { once: true });
    return;
  }
  const script = document.createElement("script");
  script.id = "facebook-jssdk"; script.async = true; script.src = "https://connect.facebook.net/es_LA/sdk.js";
  script.onload = finish; script.onerror = fail; document.body.appendChild(script);
});

const statusLabel: Record<string, string> = {
  no_conectado: "No conectado",
  pendiente: "Conexión pendiente",
  conectado: "Conectado",
  error: "Requiere revisión",
};

export default function WhatsApp() {
  const { comercio, isLoading: loadingComercio } = useComercio();
  const queryClient = useQueryClient();
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState("");
  const signupResult = useRef<{ wabaId?: string; phoneNumberId?: string }>({});
  const { data: conexion, isLoading } = useQuery({
    queryKey: ["whatsapp-comercio", comercio?.id],
    enabled: Boolean(comercio?.id),
    queryFn: async () => {
      // The generated database types do not include the WhatsApp tables yet.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("whatsapp_comercios")
        .select("*").eq("comercio_id", comercio!.id).maybeSingle();
      if (error) throw error;
      return data as WhatsAppConnection | null;
    },
  });
  const estado = conexion?.estado || "no_conectado";

  useEffect(() => {
    loadFacebookSdk().catch(() => {
      // The actionable error is shown if the user attempts to connect.
    });
  }, []);

  useEffect(() => {
    const receiveSignupResult = (event: MessageEvent) => {
      if (event.origin !== "https://www.facebook.com" || typeof event.data !== "string") return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === "WA_EMBEDDED_SIGNUP" && data.event === "FINISH") signupResult.current = { wabaId: data.data?.waba_id, phoneNumberId: data.data?.phone_number_id };
      } catch { /* Meta can emit unrelated postMessage events. */ }
    };
    window.addEventListener("message", receiveSignupResult);
    return () => window.removeEventListener("message", receiveSignupResult);
  }, []);

  const connectWhatsApp = async () => {
    if (!comercio) return;
    if (!metaAppId) { setConnectionMessage("La integración de Meta no está configurada: falta el App ID de VORTEX."); return; }
    if (!embeddedSignupConfigId) { setConnectionMessage("Meta Embedded Signup todavía está pendiente: falta cargar el Configuration ID aprobado en VORTEX."); return; }
    if (!window.FB) {
      setIsConnecting(true);
      setConnectionMessage("Preparando el acceso de Meta...");
      try {
        await loadFacebookSdk();
        setConnectionMessage("Meta ya está listo. Volvé a presionar “Iniciar autorización con Meta”.");
      } catch (error) {
        setConnectionMessage(error instanceof Error ? error.message : "No se pudo cargar el acceso de Meta.");
      } finally {
        setIsConnecting(false);
      }
      return;
    }
    setIsConnecting(true); setConnectionMessage(""); signupResult.current = {};
    try {
      const facebook = window.FB;
      facebook.init({ appId: metaAppId, cookie: true, xfbml: false, version: "v26.0" });
      const loginTimeoutId = window.setTimeout(() => {
        setConnectionMessage("Meta no respondió. Permití las ventanas emergentes y desactivá temporalmente el bloqueo de rastreadores para VORTEX.");
        setIsConnecting(false);
      }, 60000);
      const handleLoginResponse = async (response: MetaLoginResponse) => {
        try {
          const code = response?.authResponse?.code;
          const { wabaId, phoneNumberId } = signupResult.current;
          if (!code || !wabaId || !phoneNumberId) {
            setConnectionMessage("Meta no completó la selección de la cuenta y el número. Verificá que la ventana emergente no esté bloqueada y volvé a intentarlo.");
            return;
          }
          const { data, error } = await supabase.functions.invoke("whatsapp-conectar", { body: { comercioId: comercio.id, code, wabaId, phoneNumberId } });
          if (error || data?.error) {
            setConnectionMessage(data?.error || error?.message || "No se pudo guardar la conexión de WhatsApp.");
            return;
          }
          await queryClient.invalidateQueries({ queryKey: ["whatsapp-comercio", comercio.id] });
          setConnectionMessage("WhatsApp Business fue conectado correctamente.");
        } catch (error) {
          setConnectionMessage(error instanceof Error ? error.message : "No se pudo completar la conexión con Meta.");
        } finally {
          setIsConnecting(false);
        }
      };
      facebook.login((response) => {
        window.clearTimeout(loginTimeoutId);
        void handleLoginResponse(response);
      }, { config_id: embeddedSignupConfigId, response_type: "code", override_default_response_type: true, extras: { setup: {} } });
    } catch (error) { setConnectionMessage(error instanceof Error ? error.message : "No se pudo iniciar la conexión con Meta."); setIsConnecting(false); }
  };

  if (loadingComercio || isLoading) return <div className="container mx-auto p-8 text-muted-foreground">Cargando configuración...</div>;
  if (!comercio) return <div className="container mx-auto p-8 text-muted-foreground">Seleccioná un comercio para administrar WhatsApp.</div>;

  return <div className="container mx-auto max-w-5xl space-y-6 p-4 md:p-8">
    <div>
      <h1 className="flex items-center gap-2 text-3xl font-bold"><MessageCircle className="h-8 w-8 text-[#25D366]" /> WhatsApp</h1>
      <p className="mt-2 text-muted-foreground">Envío oficial de comprobantes desde VORTEX.</p>
    </div>

    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div><CardTitle>Cuenta del comercio</CardTitle><CardDescription className="mt-1">Cada comercio conecta y conserva el control de su propia cuenta WhatsApp Business.</CardDescription></div>
        <Badge variant={estado === "conectado" ? "default" : "secondary"}>{statusLabel[estado] || estado}</Badge>
      </CardHeader>
      <CardContent className="space-y-5">
        {estado === "conectado" ? <div className="grid gap-4 text-sm sm:grid-cols-2">
          <div><p className="text-muted-foreground">Número conectado</p><p className="font-medium">{conexion.numero_telefono || "Sin informar"}</p></div>
          <div><p className="text-muted-foreground">Nombre visible</p><p className="font-medium">{conexion.nombre_visible || "Sin informar"}</p></div>
        </div> : <p className="text-sm text-muted-foreground">Todavía no hay un número WhatsApp Business asociado a este comercio.</p>}
        <Dialog>
          <DialogTrigger asChild><Button><MessageCircle className="h-4 w-4" /> Conectar WhatsApp Business</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Conectar la cuenta del comercio</DialogTitle>
              <DialogDescription>La autorización se hará en Meta con la cuenta del titular del comercio. VORTEX nunca solicitará ni guardará su contraseña.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>El comercio iniciará sesión en Meta y elegirá su propia cuenta WhatsApp Business y número para facturas.</p>
              <p>Allí el comercio elegirá su cuenta WhatsApp Business y el número que utilizará para facturas.</p>
              {connectionMessage && <p className="rounded-md bg-muted p-3 text-sm">{connectionMessage}</p>}
              <Button variant="outline" className="w-full" disabled={isConnecting} onClick={connectWhatsApp}>{isConnecting ? "Conectando..." : "Iniciar autorización con Meta"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>

    <div className="grid gap-6 md:grid-cols-2">
      <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Send className="h-5 w-5" /> Facturas y comprobantes</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><p>Plantilla: <strong>{conexion?.plantilla_factura_nombre || "factura_documento"}</strong></p><p>Estado: <Badge variant="outline">{conexion?.plantilla_factura_estado || "Aprobada"}</Badge></p><p className="text-muted-foreground">Envía la factura con el PDF adjunto, el nombre del cliente y el número de comprobante.</p></CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="h-5 w-5" /> Envío seguro</CardTitle></CardHeader><CardContent className="space-y-2 text-sm text-muted-foreground"><p>Los tokens y autorizaciones permanecen en el servidor de VORTEX.</p><p>El cliente debe haber autorizado recibir comprobantes por WhatsApp.</p><p>Las plantillas se administrarán individualmente cuando el comercio conecte su propia cuenta Meta.</p></CardContent></Card>
    </div>

    <Card className="border-dashed"><CardContent className="flex gap-3 py-5 text-sm text-muted-foreground"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><p>La prueba técnica de VORTEX está activa. La conexión individual de cada comercio se habilitará con el registro integrado oficial de Meta, sin redirigir al usuario a WhatsApp Web.</p></CardContent></Card>
  </div>;
}
