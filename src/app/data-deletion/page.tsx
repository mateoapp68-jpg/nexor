export default function DataDeletionPage() {
  return (
    <div className="min-h-screen bg-[#050314] text-white">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold text-amber-400 mb-2">Eliminación de Datos</h1>
        <p className="text-white/40 text-sm mb-10">Última actualización: marzo 2026</p>

        <div className="space-y-8 text-white/70 text-sm leading-relaxed">

          <section>
            <h2 className="text-white font-semibold text-base mb-2">¿Cómo solicitar la eliminación de tus datos?</h2>
            <p>Si conectaste tu cuenta de Facebook o Instagram a Nexor y deseas que eliminemos todos los datos asociados a tu cuenta, puedes hacerlo de las siguientes maneras:</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-2">Opción 1: Desde la plataforma</h2>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Inicia sesión en <span className="text-amber-400">nex180.site</span></li>
              <li>Ve a <strong className="text-white">Servicios → Social → Cuentas</strong></li>
              <li>Haz clic en <strong className="text-white">Desconectar</strong> junto a tu cuenta de Facebook</li>
              <li>Para eliminar tu cuenta completa, ve a <strong className="text-white">Configuración → Eliminar cuenta</strong></li>
            </ol>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-2">Opción 2: Por correo electrónico</h2>
            <p>Envía un correo a <span className="text-amber-400">reyesrmateo@gmail.com</span> con el asunto <strong className="text-white">"Eliminación de datos"</strong> indicando el correo asociado a tu cuenta. Procesaremos tu solicitud en un plazo máximo de 30 días.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-2">¿Qué datos se eliminan?</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Tokens de acceso de Facebook e Instagram</li>
              <li>Información de páginas y cuentas conectadas</li>
              <li>Publicaciones programadas y su historial</li>
              <li>Datos de perfil asociados a tu cuenta de Nexor</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-2">Confirmación</h2>
            <p>Una vez procesada la solicitud, recibirás un correo de confirmación. Los datos son eliminados de forma permanente e irreversible.</p>
          </section>

        </div>
      </div>
    </div>
  )
}
