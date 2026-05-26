import { Link } from "react-router-dom";
import {
  ArrowRight,
  Banknote,
  BarChart3,
  Check,
  CreditCard,
  FileKey,
  Mail,
  Package,
  Receipt,
  ShieldCheck,
  ShoppingCart,
  Store,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const features = [
  {
    title: "Ventas y comprobantes",
    description: "Carga ventas, registra pagos y emite comprobantes con información comercial ordenada.",
    icon: ShoppingCart,
  },
  {
    title: "Stock y productos",
    description: "Administra productos, marcas, rubros, proveedores y listados para controlar el inventario.",
    icon: Package,
  },
  {
    title: "Clientes y cuenta corriente",
    description: "Centraliza clientes, saldos, movimientos e informes para seguir cada operación pendiente.",
    icon: Users,
  },
  {
    title: "Caja, bancos y cheques",
    description: "Controla caja diaria, bancos, tarjetas y cartera de cheques desde el mismo panel.",
    icon: Banknote,
  },
  {
    title: "ARCA y configuración",
    description: "Configura datos del comercio, acceso fiscal y seguridad para trabajar por negocio.",
    icon: FileKey,
  },
  {
    title: "Reportes listos",
    description: "Consulta listados de ventas, caja, productos, clientes y cuenta corriente cuando lo necesites.",
    icon: BarChart3,
  },
];

const plans = [
  {
    name: "Plan único",
    price: "$60000 mensuales",
    description: "Para comercios que necesitan ordenar ventas, clientes, stock y caja desde un solo sistema.",
    items: ["Ventas y productos", "Clientes y cuenta corriente", "Caja diaria", "Bancos, tarjetas y cheques", "Listados operativos"],
    highlighted: true,
  },
];

const Index = () => {
  return (
    <main className="min-h-screen bg-white text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <a href="#inicio" className="flex items-center gap-3">
            <img src="/logo.png" alt="VORTEX" className="h-10 w-10 rounded-md object-contain" />
            <span className="text-lg font-semibold">VORTEX</span>
          </a>

          <nav className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex">
            <a href="#funciones" className="hover:text-slate-950">Funciones</a>
            <a href="#precios" className="hover:text-slate-950">Precios</a>
            <a href="#contacto" className="hover:text-slate-950">Contacto</a>
          </nav>

          <Button asChild size="sm">
            <Link to="/login">
              Ingresar
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </header>

      <section
        id="inicio"
        className="relative overflow-hidden border-b border-slate-200 bg-slate-950 bg-cover bg-center"
        style={{
          backgroundImage:
            "linear-gradient(90deg, rgba(2, 6, 23, 0.94) 0%, rgba(8, 47, 73, 0.84) 48%, rgba(15, 23, 42, 0.42) 100%), url('https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1800&q=80')",
        }}
      >
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-cyan-500/25 to-transparent" />
        <div className="relative mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
          <div className="max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-md border border-cyan-200/40 bg-cyan-300/15 px-3 py-1 text-sm font-medium text-cyan-50 backdrop-blur">
              <Store className="h-4 w-4" />
              Sistema de gestión comercial
            </div>
            <h1 className="text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
              Gestiona ventas, stock, caja y clientes desde un solo panel.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-cyan-50">
              VORTEX reúne las operaciones diarias de tu comercio: productos, proveedores, cuenta corriente,
              bancos, tarjetas, cheques, ARCA y listados para tomar decisiones con información actualizada.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link to="/login">
                  Acceder al sistema
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white/40 bg-white/10 text-white hover:bg-white hover:text-slate-950">
                <a href="#contacto">
                  Solicitar información
                  <Mail className="h-5 w-5" />
                </a>
              </Button>
            </div>
          </div>

          <div className="relative">
            <div className="relative overflow-hidden rounded-lg border border-white/20 bg-white/95 shadow-2xl">
              <div className="border-b border-cyan-200 bg-gradient-to-r from-cyan-900 via-slate-900 to-emerald-800 p-5 text-white">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-cyan-100">Panel operativo</p>
                    <h2 className="mt-1 text-2xl font-semibold">Resumen del comercio</h2>
                  </div>
                  <Receipt className="h-9 w-9 text-amber-300" />
                </div>
              </div>
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                {[
                  ["Ventas del día", "$ 248.900"],
                  ["Clientes activos", "1.284"],
                  ["Productos cargados", "3.742"],
                  ["Movimientos de caja", "86"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-md border border-slate-200 bg-gradient-to-br from-white to-cyan-50 p-4">
                    <p className="text-sm text-slate-500">{label}</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
                  </div>
                ))}
              </div>
              <div className="border-t border-slate-200 p-5">
                <div className="space-y-3">
                  {["Venta registrada", "Cuenta corriente actualizada", "Comprobante listo para imprimir"].map((item) => (
                    <div key={item} className="flex items-center gap-3 text-sm text-slate-700">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-100 text-emerald-700">
                        <Check className="h-4 w-4" />
                      </span>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="funciones" className="border-b border-slate-200 bg-white py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-cyan-700">Funciones</p>
            <h2 className="mt-3 text-3xl font-semibold text-slate-950">Todo lo que el comercio usa a diario.</h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <article key={feature.title} className="rounded-lg border border-slate-200 bg-gradient-to-br from-white via-white to-cyan-50 p-6 shadow-sm">
                <span className="flex h-12 w-12 items-center justify-center rounded-md bg-cyan-700 text-white">
                  <feature.icon className="h-6 w-6" />
                </span>
                <h3 className="mt-5 text-lg font-semibold text-slate-950">{feature.title}</h3>
                <p className="mt-3 leading-7 text-slate-600">{feature.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="precios" className="border-b border-slate-200 bg-gradient-to-br from-slate-50 via-cyan-50 to-emerald-50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-wide text-cyan-700">Precios</p>
              <h2 className="mt-3 text-3xl font-semibold text-slate-950">Un plan simple para gestionar tu comercio.</h2>
            </div>
            <p className="max-w-md text-slate-600">Por ahora ofrecemos una única opción con las funciones principales incluidas.</p>
          </div>
          <div className="mt-10 grid w-full gap-4">
            {plans.map((plan) => (
              <article
                key={plan.name}
                className={`grid gap-8 rounded-lg border p-6 md:grid-cols-[1.15fr_0.85fr] md:p-8 ${
                  plan.highlighted ? "border-cyan-700 bg-white shadow-xl" : "border-slate-200 bg-white"
                }`}
              >
                <div>
                  <div className="inline-flex rounded-md bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">
                    Plan principal
                  </div>
                  <h3 className="mt-4 text-2xl font-semibold text-slate-950">{plan.name}</h3>
                  <p className="mt-3 max-w-2xl text-slate-600">{plan.description}</p>
                  <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                    {plan.items.map((item) => (
                      <li key={item} className="flex items-center gap-3 text-sm text-slate-700">
                        <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex flex-col justify-between rounded-lg bg-slate-950 p-6 text-white">
                  <div>
                    <p className="text-sm font-medium text-cyan-200">Inversión mensual</p>
                    <p className="mt-3 text-4xl font-semibold">{plan.price}</p>
                  </div>
                  <Button asChild size="lg" className="mt-8 bg-cyan-500 text-slate-950 hover:bg-cyan-300">
                    <a href="#contacto">
                      Consultar el plan
                      <ArrowRight className="h-5 w-5" />
                    </a>
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="contacto" className="bg-white py-20">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-cyan-700">Contacto</p>
            <h2 className="mt-3 text-3xl font-semibold text-slate-950">Conversemos sobre tu comercio.</h2>
            <p className="mt-4 leading-7 text-slate-600">
              Dejanos tus datos para coordinar una demo, definir módulos y preparar una propuesta según tu operatoria.
            </p>
            <div className="mt-8 space-y-4 text-slate-700">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-cyan-700" />
                Accesos privados por usuario y comercio.
              </div>
              <div className="flex items-center gap-3">
                <CreditCard className="h-5 w-5 text-cyan-700" />
                Gestión de pagos, tarjetas y cuenta corriente.
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="font-semibold text-slate-950">Marcos Abella</p>
                <p className="mt-1 text-sm">Analista de Sistemas</p>
                <p className="mt-2 text-sm">Tel: (03583) - 430176</p>
              </div>
            </div>
          </div>

          <form action="mailto:ms_abella@hotmail.com" method="post" encType="text/plain" className="rounded-lg border border-slate-200 bg-slate-50 p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input name="nombre" placeholder="Nombre" required />
              <Input name="comercio" placeholder="Comercio" required />
              <Input name="email" type="email" placeholder="Email" required />
              <Input name="telefono" placeholder="Teléfono" />
            </div>
            <Textarea name="mensaje" className="mt-4 min-h-32" placeholder="Contanos qué necesitás gestionar" required />
            <Button type="submit" className="mt-5 w-full sm:w-auto">
              Enviar consulta
              <Mail className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-slate-950 text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="VORTEX" className="h-9 w-9 rounded-md bg-white object-contain" />
            <div>
              <p className="font-semibold">VORTEX</p>
              <p className="text-sm text-slate-300">Sistema de gestión comercial</p>
            </div>
          </div>

          <div className="flex flex-col gap-3 text-sm text-slate-300 sm:flex-row sm:items-center sm:gap-6">
            <a href="#funciones" className="hover:text-white">Funciones</a>
            <a href="#precios" className="hover:text-white">Precios</a>
            <a href="#contacto" className="hover:text-white">Contacto</a>
            <span>© 2026 Marcos Abella</span>
          </div>
        </div>
      </footer>
    </main>
  );
};

export default Index;
