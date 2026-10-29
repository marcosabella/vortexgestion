import { useRef, useState, type FormEvent } from "react";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useEnviarConsultaLanding } from "@/hooks/useConsultasLanding";

export function LandingContactForm() {
  const enviar = useEnviarConsultaLanding();
  const id = useRef<string | null>(null);
  const [enviada, setEnviada] = useState(false);
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (enviar.isPending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const field = (name: string) => String(data.get(name) || "").trim();
    setEnviada(false);
    id.current ??= crypto.randomUUID();
    try {
      await enviar.mutateAsync({ p_id: id.current, p_nombre: field("nombre"), p_negocio: field("negocio"), p_email: field("email"), p_telefono: field("telefono"), p_mensaje: field("mensaje"), p_honey: field("website") });
      form.reset();
      id.current = null;
      setEnviada(true);
    } catch {
      // Conserva los datos y el identificador para reintentar sin duplicados.
    }
  };
  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-slate-50 p-6">
      <input name="website" type="text" className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <fieldset disabled={enviar.isPending}>
        <legend className="sr-only">Enviar una consulta</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input name="nombre" placeholder="Nombre" aria-label="Nombre" autoComplete="name" maxLength={150} required />
          <Input name="negocio" placeholder="Comercio o complejo deportivo" aria-label="Comercio o complejo deportivo" autoComplete="organization" maxLength={200} required />
          <Input name="email" type="email" placeholder="Email" aria-label="Email" autoComplete="email" maxLength={254} required />
          <Input name="telefono" type="tel" placeholder="Teléfono" aria-label="Teléfono" autoComplete="tel" maxLength={50} />
        </div>
        <Textarea name="mensaje" className="mt-4 min-h-32" placeholder="Contanos qué necesitás gestionar" aria-label="Consulta" maxLength={5000} required />
        <Button type="submit" className="mt-5 w-full sm:w-auto">
          {enviar.isPending ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Mail aria-hidden="true" className="h-4 w-4" />}
          {enviar.isPending ? "Enviando…" : "Enviar consulta"}
        </Button>
      </fieldset>
      {enviada && <p role="status" className="mt-4 text-sm text-emerald-800">Recibimos tu consulta. Nos pondremos en contacto con vos.</p>}
      {enviar.isError && <p role="alert" className="mt-4 text-sm text-red-700">{enviar.error.message}</p>}
      <p className="mt-4 text-sm leading-6 text-slate-600">También podés escribirnos a <a href="mailto:ms_abella@hotmail.com" className="break-all font-medium text-cyan-700 underline underline-offset-4">ms_abella@hotmail.com</a>.</p>
    </form>
  );
}
