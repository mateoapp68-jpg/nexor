export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/ads/encryption'
import { generateBusinessBrief } from '@/lib/ads/openai-ads'
import { getGlobalOpenAIKey, getUserCredits, logAiUsage } from '@/lib/ai-credits'

export async function POST(req: Request) {
    const ENC_KEY = process.env.ADS_ENCRYPTION_KEY
    if (!ENC_KEY) return NextResponse.json({ error: 'Configuración del servidor incompleta (ADS_ENCRYPTION_KEY)' }, { status: 500 })

    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const oaiConfig = await (prisma as any).openAIConfig.findUnique({ where: { userId: user.id } })
        let apiKey = ''
        let isGlobalKey = false
        const model = oaiConfig?.model || 'gpt-5.1'

        if (oaiConfig?.isValid && oaiConfig.apiKeyEnc) {
            try { apiKey = decrypt(oaiConfig.apiKeyEnc, ENC_KEY!) } catch {}
        }

        if (!apiKey) {
            const credits = await getUserCredits(user.id)
            if (credits <= 0) return NextResponse.json({ error: 'Sin saldo de créditos AI. Recarga en tu perfil.' }, { status: 400 })
            apiKey = (await getGlobalOpenAIKey()) ?? ''
            if (!apiKey) return NextResponse.json({ error: 'Configura tu OpenAI API Key en Configuración → IA primero' }, { status: 400 })
            isGlobalKey = true
        }

        const { text } = await req.json()
        if (!text || text.trim().length < 20) {
            return NextResponse.json({ error: 'Describe tu negocio con al menos 20 caracteres' }, { status: 400 })
        }

        const brief = await generateBusinessBrief(text.trim(), apiKey, model)
        if (isGlobalKey) logAiUsage({ userId: user.id, service: 'ads-brief', model, promptTokens: 1500, completionTokens: 800 }).catch(() => {})
        return NextResponse.json({ brief })
    } catch (err: any) {
        console.error('[GenerateBrief]', err)
        return NextResponse.json({ error: err.message || 'Error al generar el brief' }, { status: 500 })
    }
}
