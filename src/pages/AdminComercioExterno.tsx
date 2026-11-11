import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Pencil } from 'lucide-react';
import { useIsAppAdmin } from '@/hooks/useAdminComercios';
import { useComerciosExternos, type ComercioExternoForm } from '@/hooks/useComerciosExternos';
import { useClientes } from '@/hooks/useClientes';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const schema = z.object({
  id: z.string().optional(), cliente_id: z.string().uuid('Seleccioná el cliente de facturación.'),
  nombre_comercio: z.string().trim().min(1, 'Ingresá el nombre del comercio.').max(200),
  sistema: z.string().trim().min(1, 'Ingresá el sistema que utiliza.').max(200),
  url_sistema: z.string().trim().url('Ingresá una URL válida.').max(2048).refine(v => { try { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; } }, 'Usá una URL HTTPS sin credenciales.'),
  importe_mensual: z.coerce.number().finite().positive('Ingresá una membresía mayor a cero.').refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 0.00001, 'Usá hasta dos decimales.'),
  concepto: z.string().trim().min(1, 'Ingresá el concepto a facturar.').max(200),
  fecha_ingreso_sistema: z.string(), membresia_vigente_hasta: z.string(),
});

export default function AdminComercioExterno() {
  const admin = useIsAppAdmin();
  const datos = useComerciosExternos(admin.data === true);
  const { externoId } = useParams();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const actual = datos.query.data?.externos.find(e => e.id === externoId);
  const detalle = Boolean(externoId && !pathname.endsWith('/editar'));
  if (admin.isLoading) return <p className="p-6">Cargando...</p>;
  if (!admin.data) return <Navigate to="/" replace />;
  const initial: ComercioExternoForm = actual ? { ...actual, fecha_ingreso_sistema: actual.fecha_ingreso_sistema || '', membresia_vigente_hasta: actual.membresia_vigente_hasta || '' } : {
    cliente_id: params.get('cliente') || '', nombre_comercio: params.get('nombre') || '', sistema: params.get('sistema') || '',
    url_sistema: params.get('url') || '', importe_mensual: Number(params.get('importe') || 0), concepto: 'MEMBRESÍA MENSUAL DE SISTEMA', fecha_ingreso_sistema: '', membresia_vigente_hasta: '',
  };
  return <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">{detalle ? actual?.nombre_comercio || 'Comercio externo' : externoId ? 'Editar comercio externo' : 'Nuevo comercio externo'}</h1><p className="text-muted-foreground">Membresía y facturación centralizadas en Vortex.</p></div><Button asChild variant="outline"><Link to="/admin"><ArrowLeft className="h-4 w-4" />Volver</Link></Button></header>
    {datos.query.isLoading ? <p>Cargando comercio externo...</p> : datos.query.error ? <p role="alert" className="text-destructive">{datos.query.error.message}</p> : externoId && !actual ? <p role="alert">El comercio externo no está disponible.</p> : detalle && actual ? <Card><CardContent className="space-y-5 pt-6">
      <dl className="grid gap-4 text-sm sm:grid-cols-2">{[['Cliente de facturación', actual.cliente_nombre], ['Sistema', actual.sistema], ['Emisor', actual.emisor_nombre], ['Membresía mensual', Number(actual.importe_mensual).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })], ['Concepto', actual.concepto], ['Vigencia administrativa', actual.membresia_vigente_hasta || 'Sin fecha informada']].map(([nombre, valor]) => <div key={nombre}><dt className="font-medium text-muted-foreground">{nombre}</dt><dd className="break-words">{valor}</dd></div>)}</dl>
      <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><a href={actual.url_sistema} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" />Abrir sistema</a></Button>{actual.comercio_id === datos.comercio?.id && <><Button asChild variant="outline"><Link to={`/admin/comercios/externos/${actual.id}/editar`}><Pencil className="h-4 w-4" />Editar</Link></Button><Button asChild variant="outline"><Link to={`/cuenta-corriente/${actual.cliente_id}`}>Cuenta corriente del cliente</Link></Button></>}</div>
    </CardContent></Card> : actual && actual.comercio_id !== datos.comercio?.id ? <p role="alert">Seleccioná el comercio emisor {actual.emisor_nombre} para editar esta ficha.</p> : !datos.comercio ? <p role="alert">Seleccioná tu comercio emisor para registrar la membresía.</p> : <FormularioExterno key={externoId || 'nuevo'} initial={initial} datos={datos} />}
  </div>;
}

function FormularioExterno({ initial, datos }: { initial: ComercioExternoForm; datos: ReturnType<typeof useComerciosExternos> }) {
  const navigate = useNavigate();
  const clientes = useClientes();
  const form = useForm<ComercioExternoForm>({ resolver: zodResolver(schema), defaultValues: initial });
  const campo = (key: 'nombre_comercio' | 'sistema' | 'url_sistema' | 'importe_mensual' | 'concepto' | 'fecha_ingreso_sistema' | 'membresia_vigente_hasta', label: string, type = 'text') => <div className="space-y-2"><Label htmlFor={key}>{label}</Label><Input id={key} type={type} step={type === 'number' ? '0.01' : undefined} {...form.register(key)} />{form.formState.errors[key] && <p className="text-sm text-destructive">{form.formState.errors[key]?.message}</p>}</div>;
  return <Card><CardContent className="space-y-5 pt-6"><p className="text-sm text-muted-foreground">Se vincula el cliente existente para conservar sus comprobantes y cuenta corriente. Las fechas son administrativas y no bloquean el sistema externo.</p>
    {clientes.error && <p role="alert" className="text-destructive">No se pudieron cargar los clientes.</p>}
    <form className="space-y-5" onSubmit={form.handleSubmit(async values => { try { await datos.guardar.mutateAsync(values); navigate('/admin'); } catch (error) { form.setError('root', { message: error instanceof Error ? error.message : 'No se guardaron los cambios.' }); } })}><fieldset disabled={datos.guardar.isPending || form.formState.isSubmitting} className="grid gap-4 sm:grid-cols-2">
      {campo('nombre_comercio', 'Nombre del comercio')}{campo('sistema', 'Sistema utilizado')}
      <div className="space-y-2"><Label htmlFor="cliente_externo">Cliente de facturación</Label><select id="cliente_externo" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" {...form.register('cliente_id')}><option value="">Seleccionar cliente</option>{clientes.data?.map(c => <option key={c.id} value={c.id}>{c.nombre} {c.apellido} · {c.cuit || 'Sin documento'}</option>)}</select>{form.formState.errors.cliente_id && <p className="text-sm text-destructive">{form.formState.errors.cliente_id.message}</p>}</div>
      {campo('url_sistema', 'URL del sistema', 'url')}{campo('importe_mensual', 'Membresía mensual final (ARS)', 'number')}{campo('concepto', 'Concepto a facturar')}{campo('fecha_ingreso_sistema', 'Fecha de alta / pago (opcional)', 'date')}{campo('membresia_vigente_hasta', 'Membresía vigente hasta (opcional)', 'date')}
    </fieldset>{form.formState.errors.root && <p role="alert" className="text-sm text-destructive">{form.formState.errors.root.message}</p>}<div className="flex gap-3"><Button variant="success" type="submit" disabled={datos.guardar.isPending || form.formState.isSubmitting || clientes.isLoading || Boolean(clientes.error)}>{datos.guardar.isPending ? 'Guardando...' : 'Guardar comercio externo'}</Button><Button asChild variant="cancel"><Link to="/admin">Cancelar</Link></Button></div></form>
  </CardContent></Card>;
}
