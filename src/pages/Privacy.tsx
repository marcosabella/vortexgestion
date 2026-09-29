const updatedAt = "28 de septiembre de 2026";

export function PrivacyPolicy() {
  return <PublicDocument title="Política de privacidad">
    <p>VORTEX Gestión Comercial ("VORTEX") brinda herramientas de gestión comercial, facturación y comunicación para comercios.</p>
    <Section title="Información que tratamos">
      Datos de las cuentas de los comercios y sus usuarios, como nombre, correo electrónico y datos de acceso; información comercial cargada por cada comercio; y, cuando el comercio conecta WhatsApp Business, los identificadores y autorizaciones necesarios para enviar comprobantes mediante la API oficial de Meta.
    </Section>
    <Section title="Finalidad">
      Usamos la información exclusivamente para prestar el servicio, administrar cuentas, emitir comprobantes, brindar soporte, proteger la seguridad de la plataforma y enviar comprobantes por WhatsApp cuando el comercio lo autoriza. VORTEX no vende datos personales.
    </Section>
    <Section title="WhatsApp y Meta">
      Cada comercio decide si conecta su propia cuenta de WhatsApp Business. VORTEX utiliza esa autorización únicamente para gestionar la conexión y enviar comprobantes solicitados por el comercio. El comercio es responsable de contar con la autorización de sus clientes para recibir esos mensajes.
    </Section>
    <Section title="Conservación y seguridad">
      Conservamos la información durante la vigencia de la relación comercial o mientras sea necesaria para cumplir obligaciones legales. Aplicamos controles de acceso y medidas técnicas razonables para protegerla.
    </Section>
    <Section title="Tus derechos y contacto">
      Podés solicitar acceso, corrección o eliminación de tus datos escribiendo a <a href="mailto:ms_abella@hotmail.com">ms_abella@hotmail.com</a>. Para solicitudes de eliminación, también podés usar la página de eliminación de datos indicada abajo.
    </Section>
  </PublicDocument>;
}

export function DataDeletion() {
  return <PublicDocument title="Solicitud de eliminación de datos">
    <p>Para solicitar la eliminación de datos personales asociados a VORTEX Gestión Comercial, enviá un correo a <a href="mailto:ms_abella@hotmail.com?subject=Solicitud%20de%20eliminaci%C3%B3n%20de%20datos%20VORTEX">ms_abella@hotmail.com</a> con el asunto “Solicitud de eliminación de datos VORTEX”.</p>
    <Section title="Información necesaria">
      Indicá tu nombre, correo electrónico utilizado en VORTEX, el comercio al que pertenecés y, si corresponde, el número de WhatsApp Business conectado. Podremos pedir información adicional para verificar tu identidad antes de procesar la solicitud.
    </Section>
    <Section title="Plazo">
      Revisaremos la solicitud y responderemos dentro de los plazos legales aplicables. Algunos datos pueden conservarse cuando sea necesario para obligaciones contables, fiscales, prevención de fraude o defensa de derechos.
    </Section>
  </PublicDocument>;
}

export function TermsOfService() {
  return <PublicDocument title="Condiciones del servicio">
    <p>Estas condiciones regulan el uso de VORTEX Gestión Comercial ("VORTEX"), una plataforma de gestión comercial para empresas y comercios.</p>
    <Section title="Uso autorizado">
      VORTEX debe utilizarse únicamente para fines comerciales lícitos. Cada usuario es responsable de la exactitud de la información que carga, de proteger sus credenciales y de las actividades realizadas desde su cuenta.
    </Section>
    <Section title="WhatsApp Business">
      La conexión con WhatsApp Business es opcional. Cada comercio conecta y administra su propia cuenta y debe contar con autorización para comunicarse con sus clientes. VORTEX utiliza la conexión para enviar comprobantes y comunicaciones transaccionales solicitadas por el comercio, conforme a las políticas de Meta y WhatsApp.
    </Section>
    <Section title="Disponibilidad y cambios">
      Procuramos mantener el servicio disponible y seguro, pero pueden existir interrupciones por mantenimiento, proveedores externos o causas fuera de nuestro control. Las funciones del servicio pueden actualizarse para mejorar su seguridad, cumplimiento o funcionamiento.
    </Section>
    <Section title="Suspensión">
      Podremos limitar o suspender el acceso ante usos ilegales, abusivos, fraudulentos o contrarios a estas condiciones y a las políticas aplicables de los servicios integrados.
    </Section>
    <Section title="Contacto">
      Para consultas sobre estas condiciones, escribí a <a href="mailto:ms_abella@hotmail.com">ms_abella@hotmail.com</a>.
    </Section>
  </PublicDocument>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-2"><h2 className="text-lg font-semibold text-slate-900">{title}</h2><p>{children}</p></section>;
}

function PublicDocument({ title, children }: { title: string; children: React.ReactNode }) {
  return <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-700 sm:px-6"><article className="mx-auto max-w-3xl rounded-xl bg-white p-6 shadow-sm sm:p-10"><h1 className="text-3xl font-bold tracking-tight text-slate-950">{title}</h1><p className="mt-2 text-sm text-slate-500">Última actualización: {updatedAt}</p><div className="mt-8 space-y-6 leading-7">{children}</div></article></main>;
}
