import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { esDNI, generarCUITsDesdeDNI, formatCUIT } from '@/utils/validations';

export interface DatosArca {
  nombre: string;
  apellido: string;
  razonSocial?: string;
  tipoPersona: 'fisica' | 'juridica';
  situacionAfip: string;
  domicilioFiscal?: {
    calle?: string;
    numero?: string;
    localidad?: string;
    provincia?: string;
    codigoPostal?: string;
  };
  cuitEncontrado?: string;
}

// Detectar tipo de persona por prefijo del CUIT
function detectarTipoPersona(cuit: string): 'fisica' | 'juridica' {
  const cuitLimpio = cuit.replace(/[-\s]/g, '');
  const prefijo = cuitLimpio.substring(0, 2);
  return ['30', '33', '34'].includes(prefijo) ? 'juridica' : 'fisica';
}

export function useConsultarArca() {
  const [isLoading, setIsLoading] = useState(false);

  const consultarCuitDirecto = async (cuit: string): Promise<{ data: DatosArca | null; encontrado: boolean }> => {
    try {
      const { data, error } = await supabase.functions.invoke('consultar-padron-afip', {
        body: { cuit },
      });

      if (error || !data?.success) {
        return { data: null, encontrado: false };
      }

      // Verificar que realmente se encontró información útil
      const datosArca = data.data as DatosArca;
      if (datosArca && (datosArca.nombre || datosArca.apellido || datosArca.razonSocial)) {
        return { data: { ...datosArca, cuitEncontrado: cuit }, encontrado: true };
      }

      return { data: null, encontrado: false };
    } catch {
      return { data: null, encontrado: false };
    }
  };

  const consultarPorDNI = async (dni: string): Promise<DatosArca | null> => {
    const cuitsGenerados = generarCUITsDesdeDNI(dni);
    
    toast({
      title: "Buscando por DNI",
      description: `Probando ${cuitsGenerados.length} combinaciones de CUIT...`,
    });

    for (const cuit of cuitsGenerados) {
      const resultado = await consultarCuitDirecto(cuit);
      if (resultado.encontrado && resultado.data) {
        toast({
          title: "Cliente encontrado",
          description: `CUIT: ${formatCUIT(cuit)}`,
        });
        return resultado.data;
      }
    }

    return null;
  };

  const consultarCuit = async (valor: string): Promise<DatosArca | null> => {
    const valorLimpio = valor.replace(/[-\s]/g, '');
    
    if (!valor || valorLimpio.length < 7) {
      toast({
        title: "Valor inválido",
        description: "Ingrese un DNI (7-8 dígitos) o CUIT (11 dígitos)",
        variant: "destructive",
      });
      return null;
    }

    setIsLoading(true);

    try {
      // Si es DNI, buscar probando diferentes prefijos
      if (esDNI(valor)) {
        const resultado = await consultarPorDNI(valorLimpio);
        
        if (resultado) {
          return resultado;
        }

        toast({
          title: "No se encontró el DNI",
          description: "No se encontró ningún CUIT asociado a ese DNI. Verifique el número o ingrese el CUIT completo.",
          variant: "destructive",
        });
        
        return {
          nombre: '',
          apellido: '',
          tipoPersona: 'fisica',
          situacionAfip: '',
        };
      }

      // Si es CUIT, consultar directamente
      if (valorLimpio.length !== 11) {
        toast({
          title: "CUIT inválido",
          description: "El CUIT debe tener 11 dígitos",
          variant: "destructive",
        });
        return null;
      }

      const { data, error } = await supabase.functions.invoke('consultar-padron-afip', {
        body: { cuit: valor },
      });

      if (error) {
        console.error('Error de función:', error);
        const tipoPersona = detectarTipoPersona(valor);
        toast({
          title: "Error de conexión",
          description: `Se detectó persona ${tipoPersona === 'juridica' ? 'jurídica' : 'física'}. Complete los datos manualmente.`,
          variant: "destructive",
        });
        return {
          nombre: '',
          apellido: '',
          tipoPersona,
          situacionAfip: '',
        };
      }

      if (!data || !data.success) {
        const tipoPersona = data?.tipoPersona || data?.data?.tipoPersona || detectarTipoPersona(valor);
        toast({
          title: "No se pudo consultar",
          description: data?.error || `Complete los datos manualmente. Tipo: persona ${tipoPersona === 'juridica' ? 'jurídica' : 'física'}.`,
          variant: "destructive",
        });
        return data?.data || {
          nombre: '',
          apellido: '',
          tipoPersona,
          situacionAfip: '',
        };
      }

      // Mostrar advertencia si viene de API pública
      if (data.advertencia) {
        toast({
          title: "Datos obtenidos",
          description: data.advertencia,
        });
      } else {
        toast({
          title: "Datos obtenidos de AFIP",
          description: `Se completaron los datos desde ${data.data?.fuente === 'afip_oficial' ? 'el padrón oficial de AFIP' : 'fuente alternativa'}`,
        });
      }

      return data.data as DatosArca;

    } catch (error: any) {
      console.error('Error consultando padrón AFIP:', error);
      const tipoPersona = detectarTipoPersona(valor);
      toast({
        title: "Error al consultar AFIP",
        description: `Se detectó persona ${tipoPersona === 'juridica' ? 'jurídica' : 'física'}. Complete los datos manualmente.`,
        variant: "destructive",
      });
      return {
        nombre: '',
        apellido: '',
        tipoPersona,
        situacionAfip: '',
      };
    } finally {
      setIsLoading(false);
    }
  };

  return {
    consultarCuit,
    isLoading,
  };
}
