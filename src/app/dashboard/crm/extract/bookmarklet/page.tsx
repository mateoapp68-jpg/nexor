'use client'

import Link from 'next/link'
import { ArrowLeft, Bookmark, CheckCircle2, AlertCircle, MousePointer, Globe, Play } from 'lucide-react'
import { BOOKMARKLET_CODE } from '@/lib/bookmarklet-source'

// Minify and URL-encode the bookmarklet code
const bookmarkletHref = 'javascript:' + encodeURIComponent(
    BOOKMARKLET_CODE.replace(/\n\s*/g, '').replace(/\s{2,}/g, ' ')
)

export default function BookmarkletPage() {
    return (
        <div className="px-4 md:px-6 pt-6 max-w-2xl mx-auto pb-24 text-white">
            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
                <Link href="/dashboard/crm/export" className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all">
                    <ArrowLeft size={16} />
                </Link>
                <div>
                    <h1 className="text-xl font-black uppercase tracking-tighter">Nexor Extractor</h1>
                    <p className="text-white/30 text-xs mt-0.5">Bookmarklet — sin instalación, cero fricción</p>
                </div>
            </div>

            {/* Hero with drag button */}
            <div className="bg-gradient-to-br from-amber-500/10 via-amber-600/10 to-yellow-500/10 border-2 border-amber-500/30 rounded-2xl p-6 mb-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
                        <Bookmark size={22} className="text-amber-400" />
                    </div>
                    <div>
                        <p className="text-base font-black">Arrastrá este botón a tu barra de marcadores</p>
                        <p className="text-[11px] text-white/50">Una sola vez, después lo usás siempre</p>
                    </div>
                </div>

                {/* The draggable bookmarklet */}
                <div className="flex justify-center py-4">
                    {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                    <a
                        href={bookmarkletHref}
                        onClick={(e) => e.preventDefault()}
                        draggable="true"
                        className="inline-flex items-center gap-2 px-6 py-4 rounded-xl text-sm font-black uppercase tracking-wider text-black cursor-grab active:cursor-grabbing hover:scale-105 transition-transform"
                        style={{
                            background: 'linear-gradient(135deg, #B45309, #D97706, #FFD700)',
                            boxShadow: '0 8px 24px rgba(217, 119, 6, 0.4)',
                        }}
                        title="Arrastrá este botón a tu barra de marcadores"
                    >
                        🔥 Nexor Extractor
                    </a>
                </div>

                <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 text-[11px] text-white/70 leading-relaxed">
                    <b className="text-amber-400">⚠️ Importante:</b> Si tu barra de marcadores está oculta, presioná <b className="text-white">Ctrl+Shift+B</b> para mostrarla antes de arrastrar.
                </div>
            </div>

            {/* Instrucciones */}
            <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-3">Instalación (30 segundos)</p>
            <div className="space-y-3 mb-6">
                <Step
                    number={1}
                    icon={<Bookmark size={16} />}
                    title="Mostrá la barra de marcadores"
                    description={<>En Chrome presioná <b className="text-amber-400">Ctrl+Shift+B</b>. Debería aparecer una barra debajo de la barra de direcciones.</>}
                />
                <Step
                    number={2}
                    icon={<MousePointer size={16} />}
                    title="Arrastrá el botón dorado"
                    description="Con el mouse, agarrá el botón '🔥 Nexor Extractor' de arriba y arrastralo a tu barra de marcadores. Se guarda como un marcador normal."
                />
                <Step
                    number={3}
                    icon={<Globe size={16} />}
                    title="Abrí WhatsApp Web"
                    description={<>Andá a <code className="bg-white/10 px-1.5 py-0.5 rounded text-amber-400 font-mono text-[10px]">web.whatsapp.com</code> y escaneá el QR con tu celular. Esperá que carguen los chats.</>}
                />
                <Step
                    number={4}
                    icon={<Play size={16} />}
                    title="Click en tu marcador Nexor"
                    description="Aparece una ventana flotante dorada en la esquina derecha con 3 botones: Grupos, Etiquetas, Todos los chats. Elegís modo (solo teléfono o con nombre) y click en el que quieras extraer."
                />
                <Step
                    number={5}
                    icon={<CheckCircle2 size={16} />}
                    title="Se descarga el CSV"
                    description="La extracción puede tardar según cuántos grupos/chats tengas. Al final, descarga automáticamente un archivo CSV compatible con Excel."
                />
            </div>

            {/* Cómo usarlo día a día */}
            <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5 mb-6">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-3">Uso diario</p>
                <ol className="space-y-2 text-xs text-white/70">
                    <li className="flex gap-2">
                        <span className="text-amber-400 font-black">1.</span>
                        <span>Abrí WhatsApp Web (<code className="bg-white/10 px-1 py-0.5 rounded text-amber-400 font-mono text-[10px]">web.whatsapp.com</code>)</span>
                    </li>
                    <li className="flex gap-2">
                        <span className="text-amber-400 font-black">2.</span>
                        <span>Click en el marcador <b className="text-white">🔥 Nexor Extractor</b> que guardaste</span>
                    </li>
                    <li className="flex gap-2">
                        <span className="text-amber-400 font-black">3.</span>
                        <span>Aparece el panel flotante → elegí qué extraer</span>
                    </li>
                    <li className="flex gap-2">
                        <span className="text-amber-400 font-black">4.</span>
                        <span>Descarga CSV → Subilo en <Link href="/dashboard/crm/new" className="text-amber-400 underline">Nexor → CRM → Nueva campaña</Link></span>
                    </li>
                </ol>
            </div>

            {/* Ventajas */}
            <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5 mb-6">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-3">¿Por qué un bookmarklet?</p>
                <ul className="space-y-2 text-xs text-white/60">
                    <li className="flex items-start gap-2">
                        <CheckCircle2 size={12} className="text-green-400 shrink-0 mt-0.5" />
                        <span><b className="text-white">Cero instalación</b> — No es extensión, no pide permisos, no aparece en chrome://extensions</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <CheckCircle2 size={12} className="text-green-400 shrink-0 mt-0.5" />
                        <span><b className="text-white">Privacidad total</b> — Todo corre en tu navegador, ningún dato sale de tu PC</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <CheckCircle2 size={12} className="text-green-400 shrink-0 mt-0.5" />
                        <span><b className="text-white">Funciona siempre</b> — No depende de webpack ni APIs internas de WhatsApp</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <CheckCircle2 size={12} className="text-green-400 shrink-0 mt-0.5" />
                        <span><b className="text-white">Portable</b> — El marcador funciona en Chrome, Edge, Brave, Opera y cualquier navegador Chromium</span>
                    </li>
                </ul>
            </div>

            {/* Warnings */}
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-5">
                <div className="flex items-start gap-3">
                    <AlertCircle size={18} className="text-amber-400 shrink-0 mt-0.5" />
                    <div className="text-[11px] text-white/70 leading-relaxed space-y-1.5">
                        <p><b className="text-amber-400">Notas importantes:</b></p>
                        <ul className="space-y-1 list-disc pl-4">
                            <li>El bookmarklet hace <b className="text-white">clicks automáticos</b> en la UI de WhatsApp Web para abrir cada grupo/chat. Esperá que termine, no toques nada mientras corre.</li>
                            <li>La extracción puede tardar <b className="text-white">varios minutos</b> si tenés muchos grupos o chats.</li>
                            <li>Las <b className="text-white">etiquetas</b> solo funcionan con cuentas de WhatsApp Business.</li>
                            <li>Los chats quedarán marcados como <b className="text-white">leídos</b> porque el script los abre para leer el número.</li>
                            <li>Solo exportá contactos de grupos donde tenés autorización.</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    )
}

function Step({ number, icon, title, description }: {
    number: number
    icon: React.ReactNode
    title: string
    description: React.ReactNode
}) {
    return (
        <div className="flex gap-4 bg-white/[0.03] border border-white/8 rounded-2xl p-4">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0 relative">
                {icon}
                <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-amber-500 text-black text-[10px] font-black flex items-center justify-center">
                    {number}
                </div>
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white mb-0.5">{title}</p>
                <p className="text-[11px] text-white/50 leading-relaxed">{description}</p>
            </div>
        </div>
    )
}
