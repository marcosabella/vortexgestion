import { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { TarjetaCuota } from '@/types/tarjeta'

export const useTarjetaCuotas = (tarjetaId?: string) => {
  const [tarjetaCuotas, setTarjetaCuotas] = useState<TarjetaCuota[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchTarjetaCuotas = async (id?: string) => {
    try {
      setLoading(true)
      setError(null)

      let query = supabase
        .from('tarjeta_cuotas')
        .select(`
          *,
          tarjeta:tarjetas_credito (
            nombre
          )
        `)
        .order('cantidad_cuotas')

      // Solo filtrar por tarjeta_id si se proporciona y no es "all"
      if (id && id.trim() !== '' && id !== 'all') {
        query = query.eq('tarjeta_id', id)
      }

      const { data, error } = await query

      if (error) throw error
      setTarjetaCuotas(data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
      setTarjetaCuotas([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTarjetaCuotas(tarjetaId || '')
  }, [tarjetaId])

  const createTarjetaCuota = async (cuotaData: Omit<TarjetaCuota, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const { data, error } = await supabase
        .from('tarjeta_cuotas')
        .insert([cuotaData])
        .select()
        .single()

      if (error) throw error
      
      // Refrescar la lista si es para la tarjeta actual
      if (cuotaData.tarjeta_id === tarjetaId) {
        await fetchTarjetaCuotas(tarjetaId)
      }
      
      return data
    } catch (err) {
      throw err instanceof Error ? err : new Error('Error desconocido')
    }
  }

  const updateTarjetaCuota = async (id: string, cuotaData: Partial<TarjetaCuota>) => {
    try {
      const { data, error } = await supabase
        .from('tarjeta_cuotas')
        .update(cuotaData)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      
      // Refrescar la lista si es para la tarjeta actual
      if (tarjetaId) {
        await fetchTarjetaCuotas(tarjetaId)
      }
      
      return data
    } catch (err) {
      throw err instanceof Error ? err : new Error('Error desconocido')
    }
  }

  const deleteTarjetaCuota = async (id: string) => {
    try {
      const { error } = await supabase
        .from('tarjeta_cuotas')
        .delete()
        .eq('id', id)

      if (error) throw error
      
      // Refrescar la lista si es para la tarjeta actual
      if (tarjetaId) {
        await fetchTarjetaCuotas(tarjetaId)
      }
    } catch (err) {
      throw err instanceof Error ? err : new Error('Error desconocido')
    }
  }

  return {
    tarjetaCuotas,
    loading,
    error,
    createTarjetaCuota,
    updateTarjetaCuota,
    deleteTarjetaCuota,
    refetch: () => tarjetaId ? fetchTarjetaCuotas(tarjetaId) : Promise.resolve()
  }
}