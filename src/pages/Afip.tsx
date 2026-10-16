import { ArcaConfig } from '@/components/ArcaConfig';
import { EmisoresFiscalesConfig } from '@/components/EmisoresFiscalesConfig';
import { useAfipConfig } from '@/hooks/useAfipConfig';
import { useComercio } from '@/hooks/useComercio';
import { useComercioParametrizacion } from '@/hooks/useComercioParametrizacion';

function ConfiguracionUnCuit() {
  const { data: config, isLoading, error } = useAfipConfig(null);
  const { comercio } = useComercio();
  if (isLoading) return <p className="p-6">Cargando configuración...</p>;
  if (error) return <p role="alert" className="p-6 text-destructive">{error.message}</p>;
  return <ArcaConfig key={comercio?.id} config={config ?? null} />;
}

export default function AfipPage() {
  const { data: parametros } = useComercioParametrizacion();
  const { comercio } = useComercio();
  return parametros.funciones.multiples_cuit ? <EmisoresFiscalesConfig key={comercio?.id} /> : <ConfiguracionUnCuit />;
}
