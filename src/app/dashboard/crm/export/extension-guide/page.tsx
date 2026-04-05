'use client'

import Link from 'next/link'
import { ArrowLeft, Download, Chrome, Puzzle, FolderOpen, ToggleRight, CheckCircle2, AlertCircle, Package } from 'lucide-react'

export default function ExtensionGuidePage() {
    return (
        <div className="px-4 md:px-6 pt-6 max-w-2xl mx-auto pb-24 text-white">
            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
                <Link href="/dashboard/crm/export" className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all">
                    <ArrowLeft size={16} />
                </Link>
                <div>
                    <h1 className="text-xl font-black uppercase tracking-tighter">Instalar Extensión</h1>
                    <p className="text-white/30 text-xs mt-0.5">Guía paso a paso</p>
                </div>
            </div>

            {/* Descargar */}
            <div className="bg-gradient-to-br from-amber-500/5 via-amber-600/5 to-yellow-500/5 border border-amber-500/20 rounded-2xl p-5 mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                        <Chrome size={20} className="text-amber-400" />
                    </div>
                    <div>
                        <p className="text-sm font-black">Nexor WhatsApp Exporter</p>
                        <p className="text-[11px] text-white/40">v1.0.0 · 8 KB</p>
                    </div>
                </div>
                <a
                    href="/downloads/nexor-whatsapp-exporter.zip"
                    download
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-white transition-all hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg, #B45309, #D97706, #FFD700)' }}
                >
                    <Download size={14} /> Descargar
                </a>
            </div>

            {/* Pasos */}
            <div className="space-y-4">
                <Step
                    number={1}
                    icon={<Package size={18} />}
                    title="Descomprimir el archivo"
                    description="Descargá el .zip y extraelo en una carpeta cualquiera de tu computadora (ej: Escritorio)"
                />

                <Step
                    number={2}
                    icon={<Puzzle size={18} />}
                    title="Abrir la página de extensiones"
                    description={<>Abrí Chrome y escribí <code className="bg-white/10 px-1.5 py-0.5 rounded text-amber-400 font-mono text-[10px]">chrome://extensions/</code> en la barra de direcciones</>}
                />

                <Step
                    number={3}
                    icon={<ToggleRight size={18} />}
                    title="Activar modo desarrollador"
                    description="Arriba a la derecha de la página, activá el switch de 'Modo de desarrollador'"
                />

                <Step
                    number={4}
                    icon={<FolderOpen size={18} />}
                    title="Cargar la extensión"
                    description="Click en 'Cargar extensión sin empaquetar' (arriba a la izquierda) y seleccioná la carpeta descomprimida"
                />

                <Step
                    number={5}
                    icon={<CheckCircle2 size={18} />}
                    title="Listo"
                    description="Verás el icono de Nexor en la barra de extensiones de Chrome. Ahora abrí web.whatsapp.com y usá el popup."
                />
            </div>

            {/* Uso */}
            <div className="mt-8 bg-white/[0.03] border border-white/8 rounded-2xl p-5">
                <p className="text-xs font-black uppercase tracking-widest text-white/50 mb-4">Cómo usar</p>
                <ol className="space-y-3 text-sm text-white/70">
                    <li className="flex gap-3">
                        <span className="text-amber-400 font-black shrink-0">1.</span>
                        <span>Abrí <code className="bg-white/10 px-1.5 py-0.5 rounded text-amber-400 font-mono text-[11px]">web.whatsapp.com</code> y escaneá el QR con tu celular</span>
                    </li>
                    <li className="flex gap-3">
                        <span className="text-amber-400 font-black shrink-0">2.</span>
                        <span>Esperá a que carguen todos los chats (puede tardar unos segundos)</span>
                    </li>
                    <li className="flex gap-3">
                        <span className="text-amber-400 font-black shrink-0">3.</span>
                        <span>Click en el icono de Nexor en la barra de extensiones</span>
                    </li>
                    <li className="flex gap-3">
                        <span className="text-amber-400 font-black shrink-0">4.</span>
                        <span>Elegí qué exportar: <b className="text-white">Grupos</b>, <b className="text-white">Etiquetas</b> o <b className="text-white">Todos los chats</b></span>
                    </li>
                    <li className="flex gap-3">
                        <span className="text-amber-400 font-black shrink-0">5.</span>
                        <span>Se descarga un archivo <code className="bg-white/10 px-1 py-0.5 rounded text-amber-400 font-mono text-[11px]">.csv</code> compatible con Excel</span>
                    </li>
                    <li className="flex gap-3">
                        <span className="text-amber-400 font-black shrink-0">6.</span>
                        <span>Volvé a Nexor → CRM → Nueva campaña → Subí el Excel en la pestaña "Excel"</span>
                    </li>
                </ol>
            </div>

            {/* Warnings */}
            <div className="mt-6 bg-amber-500/5 border border-amber-500/20 rounded-2xl p-5">
                <div className="flex items-start gap-3">
                    <AlertCircle size={18} className="text-amber-400 shrink-0 mt-0.5" />
                    <div className="text-[11px] text-white/70 leading-relaxed space-y-1.5">
                        <p><b className="text-amber-400">Importante:</b></p>
                        <ul className="space-y-1 list-disc pl-4">
                            <li>Las etiquetas solo funcionan con cuentas de <b className="text-white">WhatsApp Business</b></li>
                            <li>No cierres la pestaña de WhatsApp Web mientras se ejecuta</li>
                            <li>El proceso puede tardar varios minutos con muchos chats</li>
                            <li>La extensión <b className="text-white">solo lee datos</b>, no envía mensajes</li>
                            <li>Todos los datos quedan en tu navegador, no se envían a ningún servidor</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    )
}

function Step({ number, icon, title, description }: { number: number; icon: React.ReactNode; title: string; description: React.ReactNode }) {
    return (
        <div className="flex gap-4 bg-white/[0.03] border border-white/8 rounded-2xl p-5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0 relative">
                {icon}
                <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-amber-500 text-black text-[10px] font-black flex items-center justify-center">
                    {number}
                </div>
            </div>
            <div className="flex-1">
                <p className="text-sm font-bold text-white mb-1">{title}</p>
                <p className="text-[12px] text-white/50 leading-relaxed">{description}</p>
            </div>
        </div>
    )
}
