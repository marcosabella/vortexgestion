# AGENTS.md

## Alcance

Estas instrucciones se aplican a todo el repositorio. Vortex Campo se desarrolla como un modulo opcional dentro de Vortex Gestion y no como una aplicacion que duplique su nucleo administrativo.

## Stack y arquitectura

- Frontend: React 18, TypeScript, Vite, React Router, TanStack React Query, Tailwind CSS, shadcn/ui y Radix UI.
- Formularios y validacion: React Hook Form y Zod.
- Backend: Supabase Auth, PostgreSQL, Row Level Security (RLS), Storage, RPC, triggers y Edge Functions sobre Deno.
- Documentos y visualizacion: jsPDF, html2canvas, QRCode y Recharts.
- Arquitectura principal: paginas y componentes -> hooks de React Query -> Supabase JS, RPC o Edge Functions -> PostgreSQL, RLS y triggers.

## Estructura relevante

- `src/pages`: paginas y composicion de modulos.
- `src/components`: componentes funcionales y componentes UI reutilizables.
- `src/hooks`: consultas, mutaciones y coordinacion con Supabase mediante React Query.
- `src/contexts`: contextos globales, incluida la autenticacion.
- `src/types`: tipos de dominio.
- `src/utils`: validaciones, generacion de PDFs y otras utilidades.
- `src/integrations/supabase`: cliente y tipos generados de Supabase.
- `src/config`: parametrizacion y ayuda de modulos.
- `supabase/migrations`: evolucion versionada del esquema y las politicas.
- `supabase/functions`: Edge Functions y codigo compartido de backend.
- `public`: recursos estaticos y documentos comerciales.

## Comandos habituales

- Desarrollo: `npm run dev`
- Verificacion TypeScript sin emitir archivos: `npx tsc --noEmit`
- Lint: `npm run lint`
- Build: `npm run build`
- Vista previa del build: `npm run preview`

No ejecutar comandos que escriban artefactos, inicien despliegues o alteren servicios externos salvo que la tarea lo autorice expresamente.

## Modelo multiempresa y seguridad

- `comercio` es la entidad empresa y el tenant del sistema.
- Toda tabla operativa nueva debe incluir `comercio_id`, sus indices adecuados y politicas RLS.
- Todas las relaciones entre entidades operativas deben validarse para asegurar que los registros pertenezcan al mismo `comercio`.
- La seguridad debe aplicarse en PostgreSQL mediante RLS, funciones y validaciones de integridad. Nunca se debe confiar solamente en `selectedComercioId`, `localStorage` o filtros del frontend.
- Los roles y permisos deben verificarse en el backend cuando una operacion requiera mas que la mera pertenencia al comercio.
- Las funciones `SECURITY DEFINER` deben limitar su `search_path`, validar el tenant y otorgar solamente los permisos de ejecucion necesarios.

## Vortex Campo

- Vortex Campo es un modulo opcional dentro de Vortex Gestion y debe habilitarse mediante la parametrizacion modular existente o una extension compatible de ella.
- Reutilizar, cuando corresponda, clientes, presupuestos, ventas, cuenta corriente, caja y las utilidades de generacion de PDFs existentes.
- Crear entidades de dominio propias para campos o establecimientos, lotes, maquinas y operarios. No sobrecargar clientes, productos u otras tablas con conceptos rurales incompatibles.
- No utilizar `mercadopago_sucursales` como bases operativas o sucursales generales: esa tabla pertenece exclusivamente a la integracion con Mercado Pago.
- La interfaz nueva debe ser responsive y utilizable desde celular, considerando operacion en contexto rural y pantallas tactiles.

## Migraciones y proteccion de datos

- No ejecutar migraciones en produccion sin autorizacion expresa.
- No eliminar ni renombrar tablas, columnas u otros objetos persistentes sin autorizacion expresa.
- No mezclar migraciones estructurales con reparaciones o modificaciones de datos productivos. Cada proposito debe tener una migracion separada y claramente identificada.
- No modificar Supabase, desplegar Edge Functions ni cambiar configuraciones remotas salvo autorizacion expresa.
- Conservar compatibilidad con Vortex Gestion y evitar cambios destructivos en los modulos existentes.

## Dependencias y alcance de cambios

- No instalar, actualizar ni eliminar dependencias sin autorizacion expresa.
- No modificar archivos ajenos al alcance solicitado sin autorizacion.
- Preservar los cambios existentes del usuario y revisar `git status` y `git diff` antes de entregar.

## Calidad y linea base

- La linea base previa de ESLint es de 108 errores y 9 advertencias.
- No se exige corregir toda la deuda de lint en cada tarea, pero ningun cambio debe aumentar esas cantidades ni introducir errores de lint en archivos modificados.
- `npx tsc --noEmit` debe continuar finalizando correctamente.
- Actualmente no hay pruebas automaticas de negocio. No afirmar que una funcion esta validada solo porque compila, supera TypeScript o genera un build.
- Para cada cambio, realizar verificaciones proporcionales al riesgo y distinguir claramente entre compilacion, lint, pruebas automatizadas y validacion funcional manual.
