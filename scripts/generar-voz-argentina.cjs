const { EdgeTTS } = require('node-edge-tts');

const narration = `¿Buscás una forma más simple de administrar tu comercio? VORTEX reúne ventas, productos, stock, caja, cuentas corrientes y reportes en una sola plataforma web. Registrá cada venta con distintos medios de pago, consultá comprobantes y mantené un historial completo de tus operaciones. Administrá productos, costos, precios y existencias para vender siempre con información actualizada. Controlá aperturas, ingresos, egresos y cierres de caja, con el detalle necesario para detectar diferencias. Con las cuentas corrientes podés conocer el saldo de cada cliente, registrar pagos y generar estados de cuenta claros. Además, los reportes transforman la actividad diaria en indicadores útiles: ventas totales, ticket promedio, rankings, stock y saldos. Menos controles dispersos, más trazabilidad y mejores decisiones. VORTEX, tu negocio en movimiento. Contactame y solicitá una demostración del sistema.`;

const tts = new EdgeTTS({
  voice: 'es-AR-TomasNeural',
  lang: 'es-AR',
  outputFormat: 'audio-24khz-96kbitrate-mono-mp3',
  pitch: '-2Hz',
  rate: '+3%',
  volume: '+0%',
  timeout: 30000,
});

tts.ttsPromise(narration, 'public/video-promocional/voz-argentina.mp3')
  .then(() => console.log('Voz argentina generada: es-AR-TomasNeural'))
  .catch((error) => { console.error(error); process.exit(1); });
