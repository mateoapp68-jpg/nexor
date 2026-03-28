export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#050314] text-white">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold text-amber-400 mb-2">Términos de Servicio</h1>
        <p className="text-white/40 text-sm mb-10">Última actualización: marzo 2026</p>

        <div className="space-y-8 text-white/70 text-sm leading-relaxed">

          <section>
            <h2 className="text-white font-semibold text-base mb-2">1. Aceptación de los términos</h2>
            <p>Al acceder y utilizar la plataforma Nexor, aceptás estos Términos de Servicio en su totalidad. Si no estás de acuerdo con alguna parte de estos términos, no podés utilizar nuestros servicios.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-2">2. Descripción del servicio</h2>
            <p>Nexor es una plataforma de marketing digital que ofrece herramientas para automatización de ventas por WhatsApp, campañas publicitarias, tiendas virtuales, landing pages y participación en campañas de contenido con monetización por vistas de video en redes sociales (YouTube, TikTok y otras).</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-2">3. Registro y cuentas</h2>
            <p>Para utilizar nuestros servicios debés registrarte con información veraz y actualizada. Sos responsable de mantener la confidencialidad de tus credenciales de acceso. Nexor no se hace responsable por accesos no autorizados derivados de negligencia del usuario.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-2">4. Conexión de cuentas de terceros</h2>
            <p>Al conectar tu cuenta de YouTube, TikTok u otras plataformas, autorizás a Nexor a acceder a la información pública de tus videos y métricas de rendimiento con el único fin de calcular pagos por vistas en campañas activas. No almacenamos contraseñas de terceros. El acceso se gestiona exclusivamente mediante tokens OAuth.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-2">5. Campañas de clipping y pagos</h2>
            <p>Los pagos por vistas de video se calculan en base al CPM (costo por mil vistas) definido por el administrador en cada campaña. Las ganancias se acreditan al wallet del usuario tras el período de hold establecido (mínimo 48 horas). Nexor se reserva el derecho de rechazar submissions que no cumplan con los requisitos de cada campaña o que muestren patrones fraudulentos.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-2">6. Uso aceptable</h2>
            <p>Queda prohibido utilizar la plataforma para actividades ilegales, spam, fraude de vistas, o cualquier acción que viole los términos de servicio de plataformas de terceros (YouTube, TikTok, Meta, etc.).</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-2">7. Modificaciones</h2>
            <p>Nexor puede modificar estos términos en cualquier momento. Los cambios serán notificados a través de la plataforma. El uso continuado del servicio implica la aceptación de los nuevos términos.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-2">8. Contacto</h2>
            <p>Para consultas sobre estos términos, contactanos a través de la plataforma en <span className="text-amber-400">nexor-itt9.onrender.com</span>.</p>
          </section>

        </div>
      </div>
    </div>
  )
}
