export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#050314] text-white">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold text-amber-400 mb-2">Política de Privacidad</h1>
        <p className="text-white/40 text-sm mb-10">Última actualización: marzo 2026</p>

        <div className="space-y-8 text-white/70 text-sm leading-relaxed">

          <section>
            <h2 className="text-white font-semibold text-base mb-2">1. Información que recopilamos</h2>
            <p>Recopilamos información que nos proporcionás al registrarte (nombre, correo electrónico, teléfono) y datos generados por el uso de la plataforma. Al conectar cuentas de YouTube o TikTok mediante OAuth, accedemos únicamente a métricas públicas de tus videos (título, vistas, likes) con tu consentimiento explícito.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-2">2. Cómo usamos tu información</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Proveer y mejorar nuestros servicios</li>
              <li>Calcular pagos por participación en campañas de clipping</li>
              <li>Enviar notificaciones relacionadas con tu cuenta</li>
              <li>Prevenir fraudes y garantizar la seguridad de la plataforma</li>
              <li>Cumplir con obligaciones legales</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-2">3. Tokens de acceso de terceros</h2>
            <p>Los tokens OAuth de YouTube y TikTok se almacenan de forma cifrada en nuestra base de datos. Solo se utilizan para consultar métricas de videos en campañas activas. Podés revocar el acceso en cualquier momento desde la configuración de tu cuenta o directamente desde la plataforma de terceros (Google/TikTok).</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-2">4. Compartir información</h2>
            <p>No vendemos ni compartimos tu información personal con terceros con fines comerciales. Podemos compartir datos con proveedores de servicios que nos ayudan a operar la plataforma (base de datos, almacenamiento en la nube), bajo acuerdos de confidencialidad.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-2">5. Seguridad</h2>
            <p>Implementamos medidas técnicas y organizativas para proteger tu información, incluyendo cifrado de datos sensibles (tokens, claves API) y conexiones HTTPS. Sin embargo, ningún sistema es 100% seguro y no podemos garantizar la seguridad absoluta.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-2">6. Tus derechos</h2>
            <p>Tenés derecho a acceder, corregir o eliminar tus datos personales. Para ejercer estos derechos, contactanos a través de la plataforma. También podés desconectar tus cuentas de YouTube y TikTok en cualquier momento desde tu perfil.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-2">7. Cookies</h2>
            <p>Utilizamos cookies de sesión necesarias para el funcionamiento de la plataforma (autenticación). No utilizamos cookies de seguimiento publicitario.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-2">8. Cambios en esta política</h2>
            <p>Podemos actualizar esta política cuando sea necesario. Te notificaremos sobre cambios significativos a través de la plataforma.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-2">9. Contacto</h2>
            <p>Para consultas sobre privacidad, contactanos en <span className="text-amber-400">nexor-itt9.onrender.com</span>.</p>
          </section>

        </div>
      </div>
    </div>
  )
}
