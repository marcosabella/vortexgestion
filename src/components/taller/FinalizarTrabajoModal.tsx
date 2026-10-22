import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { TallerOrden } from '@/types/taller';
import { TallerModal } from './TallerForms';
import { TallerCampo, type TallerData } from './TallerUI';

export function FinalizarTrabajoModal({ data, orden, onClose }: {
  data: Pick<TallerData, 'run' | 'isPending'>;
  orden: Pick<TallerOrden, 'id' | 'version' | 'trabajo_realizado'>;
  onClose: () => void;
}) {
  const [trabajo, setTrabajo] = useState(orden.trabajo_realizado || '');
  const [versionInicial] = useState(orden.version);
  const [detalle, setDetalle] = useState('');
  const [guardando, setGuardando] = useState(false);
  const enCurso = useRef(false);
  const pending = data.isPending || guardando;
  return <TallerModal title="Finalizar trabajo" open pending={pending} onClose={onClose}>
    <form className="space-y-4" onSubmit={async event => {
      event.preventDefault();
      if (enCurso.current || data.isPending || !trabajo.trim()) return;
      enCurso.current = true;
      setGuardando(true);
      try {
        await data.run({ name: 'taller_finalizar_orden', args: {
          p_orden_id: orden.id, p_version: versionInicial,
          p_trabajo_realizado: trabajo.trim(), p_detalle: detalle.trim(),
        } });
        onClose();
      } catch { /* La mutación informa el error; se conservan los campos. */ }
      finally { enCurso.current = false; setGuardando(false); }
    }}>
      <p className="text-sm">Completá el trabajo realizado para dejar la orden lista para entregar.</p>
      <TallerCampo label="Trabajo realizado *"><Textarea name="trabajo_realizado" required autoFocus disabled={pending} value={trabajo} onChange={event => setTrabajo(event.target.value)} /></TallerCampo>
      <TallerCampo label="Observaciones de finalización (opcional)"><Textarea name="detalle_finalizacion" disabled={pending} value={detalle} onChange={event => setDetalle(event.target.value)} /></TallerCampo>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" disabled={pending} onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={pending || !trabajo.trim()}>{pending ? 'Guardando...' : 'Finalizar trabajo'}</Button>
      </div>
    </form>
  </TallerModal>;
}
