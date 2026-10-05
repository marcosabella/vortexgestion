export interface TicketWsaa { token: string; sign: string; expirationTime: string }
interface RpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export async function obtenerTicketWsaaCacheado(
  client: RpcClient, comercioId: string, certPem: string, servicio: string, ambiente: string,
  emitir: () => Promise<TicketWsaa>,
  esperar: () => Promise<void> = () => new Promise(resolve => setTimeout(resolve, 500)),
): Promise<TicketWsaa> {
  // Huella independiente de saltos de linea; cambia cuando cambia el certificado.
  const certBody = certPem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(certBody));
  const huella = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  const args = { p_comercio_id: comercioId, p_clave: `${ambiente}:${servicio}:${huella}`, p_reserva: crypto.randomUUID() };
  for (let intento = 0; intento < 20; intento++) {
    const { data, error } = await client.rpc('afip_wsaa_reservar_ticket', args);
    if (error) throw new Error(`No se pudo consultar el ticket WSAA: ${error.message}`);
    const result = data as TicketWsaa & { estado: string };
    if (result?.estado === 'vigente') return { token: result.token, sign: result.sign, expirationTime: result.expirationTime };
    if (result?.estado === 'ocupado') { await esperar(); continue; }
    if (result?.estado !== 'renovar') throw new Error('Estado de ticket WSAA no valido');
    try {
      const ticket = await emitir();
      const { error: saveError } = await client.rpc('afip_wsaa_guardar_ticket', { ...args, p_ticket: ticket });
      if (saveError) throw new Error(`No se pudo conservar el ticket WSAA: ${saveError.message}`);
      return ticket;
    } catch (error) {
      await client.rpc('afip_wsaa_guardar_ticket', { ...args, p_ticket: null });
      if (error instanceof Error && /ya posee un TA valido|alreadyAuthenticated/i.test(error.message)) {
        throw new Error('ARCA tiene un ticket de acceso vigente que no fue conservado por la version anterior. Espere su vencimiento antes de volver a autenticar. Este mensaje no indica si la factura tiene CAE.');
      }
      throw error;
    }
  }
  throw new Error('La autenticacion ARCA esta en curso. Espere unos segundos y vuelva a intentar.');
}
