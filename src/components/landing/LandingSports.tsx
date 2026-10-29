import { ArrowRight, CalendarDays, Clock, CreditCard, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";

const features = [
  { icon: CalendarDays, title: "Reservas y canchas", description: "Calendario de turnos, horarios y disponibilidad del complejo." },
  { icon: Clock, title: "Turnos fijos", description: "Organizá las reservas que se repiten cada semana." },
  { icon: UserRound, title: "Panel del jugador", description: "Acceso personal para reservar y consultar sus próximos turnos y su cuenta." },
  { icon: CreditCard, title: "Gestión del complejo", description: "Administrá jugadores, cobros, ventas, caja y cuentas corrientes." },
];

const sportsClients = [
  { name: "Pádel Center", logo: "/landing/padel-center.png" },
  { name: "Pura Vida", logo: "/landing/pura-vida.png" },
];

export function LandingSports() {
  return (
    <div aria-labelledby="deportes-title" className="mt-12 overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-cyan-50">
      <div className="grid gap-10 p-6 sm:p-8 lg:grid-cols-[1.2fr_1fr] lg:p-10">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Sistema de reservas y administración</p>
          <h3 id="deportes-title" className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Gestión integral para complejos deportivos.</h3>
          <p className="mt-4 leading-7 text-slate-600">Una plataforma que centraliza las reservas, la disponibilidad de canchas, los turnos fijos y los cobros. Incluye un panel de administración para el complejo y un acceso personal para que cada jugador realice reservas y consulte sus turnos y su cuenta desde el celular.</p>
          <div className="mt-7 grid gap-6 sm:grid-cols-2">
            {features.map(feature => (
              <div key={feature.title}>
                <feature.icon aria-hidden="true" className="h-5 w-5 text-emerald-700" />
                <h4 className="mt-2 font-semibold text-slate-900">{feature.title}</h4>
                <p className="mt-1 text-sm leading-6 text-slate-600">{feature.description}</p>
              </div>
            ))}
          </div>
          <Button asChild size="lg" className="mt-8 h-auto min-h-11 whitespace-normal bg-emerald-700 text-white hover:bg-emerald-800">
            <a href="#contacto">Solicitar demo para mi complejo <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" /></a>
          </Button>
        </div>
        <div className="flex flex-col justify-center">
          <p className="text-center text-sm font-semibold text-emerald-800">Ellos ya usan nuestro sistema de reservas</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {sportsClients.map(client => (
              <figure key={client.name} className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <img src={client.logo} alt={`Logo de ${client.name}`} width={240} height={144} loading="lazy" className="h-36 w-full object-contain" />
                <figcaption className="mt-4 text-lg font-semibold text-slate-900">{client.name}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
