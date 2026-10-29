import { ArrowRight, Flame, Sprout, Store, Truck, UtensilsCrossed, Wrench } from "lucide-react";

const modules = [
  { name: "Vortex Gestión", audience: "Comercios y negocios", icon: Store, description: "Tu administración en un solo lugar: ventas, compras, stock, clientes, caja y cuenta corriente.", features: "Ventas · Stock · Caja · ARCA" },
  { name: "Vortex Taller", audience: "Talleres y servicios automotores", icon: Wrench, description: "Organizá cada reparación, desde el ingreso del vehículo y el presupuesto hasta la entrega y el cobro.", features: "Vehículos · Órdenes de trabajo · Repuestos · Turnos" },
  { name: "Vortex Restaurante", audience: "Restaurantes, bares y delivery", icon: UtensilsCrossed, description: "Conectá el salón, la cocina y el reparto para seguir cada pedido hasta su entrega y cierre.", features: "Mesas · Comandas · Cocina · Delivery" },
  { name: "Vortex Distribuidora", audience: "Distribuidoras y mayoristas", icon: Truck, description: "Coordiná pedidos, preparación y reparto. Seguí entregas, devoluciones y rendiciones junto con tu gestión comercial.", features: "Pedidos · Repartos · Remitos · Rendiciones" },
  { name: "Vortex Campo", audience: "Establecimientos rurales", icon: Sprout, description: "Centralizá establecimientos y lotes dentro de Vortex para mantener organizada la información de tu actividad rural.", features: "Establecimientos · Lotes · Gestión integrada" },
  { name: "Vortex Extintores", audience: "Servicios y mantenimiento de extintores", icon: Flame, description: "Organizá la asignación y el seguimiento de extintores por cliente junto con la administración de tu negocio.", features: "Extintores · Clientes · Seguimiento" },
];

export function LandingModules() {
  return (
    <section id="modulos" aria-labelledby="modulos-title" className="scroll-mt-20 border-b border-slate-800 bg-slate-950 py-20 text-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-cyan-300">Un Vortex para tu actividad</p>
          <h2 id="modulos-title" className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Tu negocio tiene su forma de trabajar. Vortex te acompaña.</h2>
          <p className="mt-5 leading-7 text-slate-300">Partí de Vortex Gestión y sumá los módulos que necesita tu rubro. Una misma gestión de clientes, ventas y caja, con herramientas para tu actividad.</p>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {modules.map(module => (
            <article key={module.name} className="flex flex-col rounded-2xl border border-white/15 bg-gradient-to-br from-white/10 to-white/[0.02] p-6 sm:p-7">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-300/10 text-cyan-200"><module.icon aria-hidden="true" className="h-6 w-6" /></span>
              <p className="mt-6 text-xs font-medium uppercase tracking-wide text-cyan-200">{module.audience}</p>
              <h3 className="mt-2 text-2xl font-semibold">{module.name}</h3>
              <p className="mt-4 flex-1 leading-7 text-slate-300">{module.description}</p>
              <p className="mt-6 border-t border-white/10 pt-5 text-sm leading-6 text-slate-300">{module.features}</p>
              <a href="#contacto" aria-label={`Consultar por ${module.name}`} className="mt-5 inline-flex min-h-11 items-center gap-2 self-start rounded text-sm font-semibold text-cyan-200 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300">Consultar por este módulo <ArrowRight aria-hidden="true" className="h-4 w-4" /></a>
            </article>
          ))}
        </div>
        <p className="mt-8 text-sm leading-6 text-slate-300">Los módulos se habilitan según la actividad de cada comercio. Consultanos para definir la configuración y propuesta para tu negocio.</p>
      </div>
    </section>
  );
}
