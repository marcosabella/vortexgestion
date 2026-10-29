import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { LandingSports } from "@/components/landing/LandingSports";

// Selección comercial verificada el 29/10/2026. Sólo nombres y logos públicos;
// no consultar la tabla administrativa de comercios desde la landing.
const logoBase = "https://zhtqkygjvaaizbdwwsbi.supabase.co/storage/v1/object/public/comercio-logos";
const clients = [
  { name: "ALVAREZ NEUMATICOS Y SERVICIOS", logo: `${logoBase}/b1c0f870-5c5d-4a83-965a-8676ea6746fa/logo?v=1792058935492` },
  { name: "BERRA EXTINTORES", logo: `${logoBase}/ba927680-6870-4eca-a795-f5b72d51e7d9/logo?v=1789053118945` },
  { name: "BOSTICO Y BARTOLOME SOCIEDAD SIMPLE", logo: `${logoBase}/a4983b26-4f3d-46e0-8e4f-46bd34fec838/logo?v=1790260592128` },
  { name: "DIEGO GUILLERMO HOURDEBAIGT", logo: null },
  { name: "EUFORIA CLOTHING", logo: `${logoBase}/0987ef9c-c602-40cf-84c3-64d2f644428d/logo?v=1781737032707` },
  { name: "PAQUIN S.A.S", logo: null },
  { name: "TALLER INTEGRAL BARTOLOME", logo: `${logoBase}/3555948a-ff4c-4c89-8bb1-3a65982635d8/logo?v=1792506857554` },
];

function ClientCard({ name, logo }: (typeof clients)[number]) {
  const [failedLogo, setFailedLogo] = useState(false);
  const initials = name.split(/\s+/).slice(0, 2).map(word => word[0]).join("");

  return (
    <article className="flex h-full flex-col items-center rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
      <div className="flex h-24 w-full items-center justify-center">
        {logo && !failedLogo ? (
          <img src={logo} alt={`Logo de ${name}`} loading="lazy" width={192} height={96} className="h-full w-full object-contain" onError={() => setFailedLogo(true)} />
        ) : (
          <span aria-hidden="true" className="flex h-20 w-20 items-center justify-center rounded-2xl bg-cyan-50 text-2xl font-semibold text-cyan-800">{initials}</span>
        )}
      </div>
      <h3 className="mt-5 text-sm font-semibold leading-6 text-slate-800">{name}</h3>
    </article>
  );
}

export function LandingClients() {
  return (
    <section id="clientes" aria-labelledby="clientes-title" className="scroll-mt-20 border-b border-slate-200 bg-slate-50 py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-cyan-700">Nuestros clientes</p>
          <h2 id="clientes-title" className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Negocios que confían en nuestras soluciones.</h2>
          <p className="mt-5 leading-7 text-slate-600">Comercios, talleres y complejos deportivos: detrás de cada negocio hay personas que lo hacen crecer. Conocé a quienes eligen nuestras herramientas para acompañar su trabajo de todos los días.</p>
        </div>
        <h3 className="mt-10 text-lg font-semibold text-slate-950">Comercios que ya gestionan con Vortex</h3>
        <div className="mt-5 grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {clients.map(client => <ClientCard key={client.name} {...client} />)}
          <a href="#contacto" className="group flex min-h-52 flex-col items-center justify-center rounded-2xl border border-cyan-200 bg-cyan-950 p-6 text-center text-white transition-colors hover:bg-cyan-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-700">
            <span className="text-lg font-semibold">Tu comercio también puede ser parte.</span>
            <span className="mt-4 inline-flex items-center gap-2 text-sm text-cyan-200">Conocé Vortex <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
          </a>
        </div>
        <LandingSports />
      </div>
    </section>
  );
}
