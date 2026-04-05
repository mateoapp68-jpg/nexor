'use client'

import Link from 'next/link'
import { ArrowLeft, Download, Package, FolderOpen, ToggleRight, Puzzle, CheckCircle2, AlertCircle, Globe, Upload } from 'lucide-react'

export default function InstallGuidePage() {
    return (
        <div className="px-4 md:px-6 pt-6 max-w-2xl mx-auto pb-24 text-white">
            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
                <Link href="/dashboard/crm/export" className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all">
                    <ArrowLeft size={16} />
                </Link>
                <div>
                    <h1 className="text-xl font-black uppercase tracking-tighter">Instalar Extensión</h1>
                    <p className="text-white/30 text-xs mt-0.5">Nexor Contacts Extractor para Chrome</p>
                </div>
            </div>

            {/* Download card */}
            <div className="bg-gradient-to-br from-amber-500/10 via-amber-600/10 to-yellow-500/10 border-2 border-amber-500/30 rounded-2xl p-6 mb-6">
                <div className="flex items-center gap-4 mb-4">
                    <div className="w-14 h-14 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
                        <Package size={28} className="text-amber-400" />
                    </div>
                    <div>
                        <p className="text-lg font-black">Nexor Contacts Extractor</p>
                        <p className="text-[11px] text-white/50">v2.0.0 · 12 KB · Chrome / Edge / Brave</p>
                    </div>
                </div>
                <a
                    href="/downloads/nexor-contacts-extractor.zip"
                    download
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider text-black transition-all hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg, #B45309, #D97706, #FFD700)' }}
                >
                    <Download size={14} /> Descargar ZIP
                </a>
            </div>

            {/* Pasos de instalación */}
            <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-3">Pasos de instalación</p>
            <div className="space-y-3 mb-8">
                <Step
                    number={1}
                    icon={<Download size={16} />}
                    title="Descargá el ZIP"
                    description="Click en el botón dorado de arriba. Se guarda en tu carpeta de Descargas."
                />
                <Step
                    number={2}
                    icon={<FolderOpen size={16} />}
                    title="Descomprimí el ZIP"
                    description="Click derecho sobre nexor-contacts-extractor.zip → Extraer todo. Te deja una carpeta llamada nexor-contacts-extractor."
                />
                <Step
                    number={3}
                    icon={<Puzzle size={16} />}
                    title="Abrí chrome://extensions/"
                    description={
                        <>
                            Abrí Chrome y escribí <code className="bg-white/10 px-1.5 py-0.5 rounded text-amber-400 font-mono text-[10px]">chrome://extensions/</code> en la barra de direcciones, después presioná Enter.
                        </>
                    }
                />
                <Step
                    number={4}
                    icon={<ToggleRight size={16} />}
                    title="Activá el modo desarrollador"
                    description="Arriba a la derecha de la página de extensiones, activá el switch de 'Modo de desarrollador'. Se despliegan opciones nuevas."
                />
                <Step
                    number={5}
                    icon={<Upload size={16} />}
                    title="Cargá la extensión"
                    description="Click en 'Cargar descomprimida' (arriba a la izquierda) y seleccioná la carpeta nexor-contacts-extractor que descomprimiste en el paso 2."
                />
                <Step
                    number={6}
                    icon={<CheckCircle2 size={16} />}
                    title="Listo"
                    description="Aparece el ícono de Nexor en la barra de extensiones de Chrome. Si no lo ves, click en el ícono del rompecabezas y fijalo."
                />
            </div>

            {/* Cómo usarla */}
            <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-3">Cómo usarla</p>
            <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5 mb-6">
                <ol className="space-y-3 text-xs text-white/70 leading-relaxed">
                    <li className="flex gap-3">
                        <span className="text-amber-400 font-black shrink-0">1.</span>
                        <span>Abrí <code className="bg-white/10 px-1 py-0.5 rounded text-amber-400 font-mono text-[10px]">web.whatsapp.com</code> y escaneá el QR con tu celular</span>
                    </li>
                    <li className="flex gap-3">
                        <span className="text-amber-400 font-black shrink-0">2.</span>
                        <span>Esperá a que carguen todos los chats (unos segundos)</span>
                    </li>
                    <li className="flex gap-3">
                        <span className="text-amber-400 font-black shrink-0">3.</span>
                        <span>Click en el ícono de <b className="text-white">Nexor</b> en la barra de extensiones de Chrome</span>
                    </li>
                    <li className="flex gap-3">
                        <span className="text-amber-400 font-black shrink-0">4.</span>
                        <span>Esperá a que diga <b className="text-green-400">"Conectado ✓"</b> (tarda unos segundos la primera vez)</span>
                    </li>
                    <li className="flex gap-3">
                        <span className="text-amber-400 font-black shrink-0">5.</span>
                        <span>Elegí qué exportar: <b className="text-white">Grupos</b> · <b className="text-white">Etiquetas</b> · <b className="text-white">Todos los chats</b></span>
                    </li>
                    <li className="flex gap-3">
                        <span className="text-amber-400 font-black shrink-0">6.</span>
                        <span>Seleccioná los elementos con checkboxes y elegí modo (solo teléfono o con nombre)</span>
                    </li>
                    <li className="flex gap-3">
                        <span className="text-amber-400 font-black shrink-0">7.</span>
                        <span>Click en <b className="text-white">Exportar</b> → descarga un CSV</span>
                    </li>
                    <li className="flex gap-3">
                        <span className="text-amber-400 font-black shrink-0">8.</span>
                        <span>
                            Volvé a <Link href="/dashboard/crm/new" className="text-amber-400 underline">Nexor → CRM → Nueva campaña</Link> y subí el CSV
                        </span>
                    </li>
                </ol>
            </div>

            {/* Warnings */}
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-5">
                <div className="flex items-start gap-3">
                    <AlertCircle size={18} className="text-amber-400 shrink-0 mt-0.5" />
                    <div className="text-[11px] text-white/70 leading-relaxed space-y-1.5">
                        <p><b className="text-amber-400">Notas importantes:</b></p>
                        <ul className="space-y-1 list-disc pl-4">
                            <li>WhatsApp Web debe estar abierto en otra pestaña cuando uses la extensión</li>
                            <li>Las etiquetas solo funcionan con cuentas de <b className="text-white">WhatsApp Business</b></li>
                            <li>Todos los datos quedan en tu navegador, no se envían a ningún servidor</li>
                            <li>La extensión solo <b className="text-white">lee datos</b>, no envía mensajes ni modifica nada</li>
                            <li>Si actualizamos la extensión, tenés que descargar el ZIP nuevo y reemplazar la carpeta</li>
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
            <div className="flex-1">
                <p className="text-sm font-bold text-white mb-0.5">{title}</p>
                <p className="text-[11px] text-white/50 leading-relaxed">{description}</p>
            </div>
        </div>
    )
}
