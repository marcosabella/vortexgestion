import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useComercio } from '@/hooks/useComercio';
import { useAccesoComercio } from '@/hooks/useUsuariosComercio';
import { useCampoOperarios } from '@/hooks/useCampoOperarios';
import { useCampoOperadores, type CampoOperador } from '@/hooks/useCampoOperadores';

export default function CampoOperadores() {
  const { comercio } = useComercio();
  const acceso = useAccesoComercio();
  const { usuarioId } = useParams();
  const admin = Boolean(acceso.data?.admin);
  const operadores = useCampoOperadores(comercio?.id, admin);
  const operarios = useCampoOperarios(comercio?.id, admin);
  if (acceso.isPending || !comercio) return <p className="p-6">Verificando acceso…</p>;
  if (!admin) return <p role="alert" className="p-6">Solo administración puede gestionar las vinculaciones de usuarios.</p>;
  if (operadores.query.isPending || operarios.isPending) return <p className="p-6">Cargando operadores…</p>;
  if (operadores.query.error || operarios.error) return <p role="alert" className="p-6">No se pudieron cargar las vinculaciones.</p>;
  const items = operadores.query.data || [];
  const target = items.find(u => u.user_id === usuarioId);
  if (usuarioId) return target ? <Vincular key={comercio.id + usuarioId} operador={target} operarios={(operarios.data || []).filter(o => o.activo && (o.id === target.operario_id || !items.some(u => u.operario_id === o.id)))} guardar={id => operadores.link.mutateAsync({ userId: target.user_id, operarioId: id })} /> : <p role="alert" className="p-6">El usuario no está disponible en Campo.</p>;
  return <div className="space-y-5 p-3 sm:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Usuarios y operadores de Campo</h1><p className="text-muted-foreground">Vinculá las cuentas con sus fichas de operario.</p></div><Button asChild><Link to="/usuarios">Usuarios y permisos</Link></Button></header>
    <p className="text-sm text-muted-foreground">Las altas, bajas y permisos se administran desde Configuración → Usuarios y permisos. Aquí se conserva la vinculación operativa con Campo.</p>
    <div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Usuario</TableHead><TableHead>Operario</TableHead><TableHead>Estado</TableHead><TableHead>Acciones</TableHead></TableRow></TableHeader><TableBody>{items.map(u => <TableRow key={u.user_id}><TableCell>{u.email}</TableCell><TableCell>{u.operario_nombre || 'Sin vincular'}</TableCell><TableCell>{u.activo ? 'Activo' : 'Inactivo'}</TableCell><TableCell><div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link to={'/campo/operadores/' + u.user_id + '/vincular'}>Vincular operario</Link></Button><Button asChild variant="outline"><Link to={'/usuarios/' + u.user_id + '/editar'}>Editar acceso</Link></Button></div></TableCell></TableRow>)}{!items.length && <TableRow><TableCell colSpan={4}>No hay usuarios con acceso a Campo.</TableCell></TableRow>}</TableBody></Table></div>
  </div>;
}

function Vincular({ operador, operarios, guardar }: { operador: CampoOperador; operarios: { id: string; nombre: string }[]; guardar: (id: string | null) => Promise<unknown> }) {
  const navigate = useNavigate();
  const [id, setId] = useState(operador.operario_id || '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const volver = () => navigate('/campo/operadores');
  return <div className="mx-auto max-w-3xl space-y-5 p-3 sm:p-6"><header className="flex flex-wrap justify-between gap-3"><h1 className="text-2xl font-bold">Vincular operario</h1><Button variant="outline" disabled={pending} onClick={volver}>Volver</Button></header><p>{operador.email}</p><form className="space-y-4 rounded-lg border p-4" onSubmit={async e => { e.preventDefault(); setError(''); setPending(true); try { await guardar(id || null); volver(); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar el vínculo'); } finally { setPending(false); } }}><Label htmlFor="campo-usuario-operario">Operario</Label><select id="campo-usuario-operario" className="min-h-11 w-full rounded-md border bg-background px-3" value={id} onChange={e => setId(e.target.value)} disabled={pending}><option value="">Sin vincular</option>{operarios.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}</select>{error && <p role="alert" className="text-destructive">{error}</p>}<div className="flex gap-3"><Button disabled={pending}>{pending ? 'Guardando…' : 'Guardar vínculo'}</Button><Button type="button" variant="outline" disabled={pending} onClick={volver}>Cancelar</Button></div></form></div>;
}