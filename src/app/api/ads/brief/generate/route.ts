export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/ads/encryption'
import { generateBusinessBrief } from '@/lib/ads/openai-ads'

export async function POST(req: Request) {
    const ENC_KEY = process.env.ADS_ENCRYPTION_KEY
    if (!ENC_KEY) return NextResponse.json({ error: 'Configuración del servidor incompleta (ADS_ENCRYPTION_KEY)' }, { status: 500 })

    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const oaiConfig = await (prisma as any).openAIConfig.findUnique({ where: { userId: user.id } })
        if (!oaiConfig?.isValid || !oaiConfig?.apiKeyEnc) {
            return NextResponse.json({ error: 'Configura tu OpenAI API Key en Configuración → IA primero' }, { status: 400 })
        }

        let apiKey: string
        try {
            apiKey = decrypt(oaiConfig.apiKeyEnc, ENC_KEY!)
        } catch {
            return NextResponse.json({ error: 'Error al leer tu API key de OpenAI. Reconecta tu cuenta en Configuración → IA.' }, { status: 500 })
        }

        const { text } = await req.json()
        if (!text || text.trim().length < 20) {
            return NextResponse.json({ error: 'Describe tu negocio con al menos 20 caracteres' }, { status: 400 })
        }

        const brief = await generateBusinessBrief(text.trim(), apiKey, oaiConfig.model)
        return NextResponse.json({ brief })
    } catch (err: any) {
        console.error('[GenerateBrief]', err)
        return NextResponse.json({ error: err.message || 'Error al generar el brief' }, { status: 500 })
    }
}
