export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/ads/encryption'
import { generateStrategySuggestions } from '@/lib/ads/openai-ads'
import { getUserCredits, getGlobalOpenAIKey, logAiUsage } from '@/lib/ai-credits'

export async function POST(req: NextRequest) {
    const ENC_KEY = process.env.ADS_ENCRYPTION_KEY
    if (!ENC_KEY) return NextResponse.json({ error: 'Configuración del servidor incompleta (ADS_ENCRYPTION_KEY)' }, { status: 500 })

    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    try {
        const body = await req.json()
        const { briefId } = body
        if (!briefId) return NextResponse.json({ error: 'briefId requerido' }, { status: 400 })

        // Fetch brief
        const brief = await (prisma as any).businessBrief.findFirst({
            where: { id: briefId, userId: user.id }
        })
        if (!brief) return NextResponse.json({ error: 'Brief no encontrado' }, { status: 404 })

        // Resolver key: propia → global (si tiene saldo)
        const openaiConfig = await (prisma as any).openAIConfig.findUnique({ where: { userId: user.id } })
        let apiKey = ''
        let isGlobalKey = false
        const model = openaiConfig?.model || 'gpt-5.1'

        if (openaiConfig?.isValid && openaiConfig.apiKeyEnc) {
            try { apiKey = decrypt(openaiConfig.apiKeyEnc, ENC_KEY!) } catch {}
        }

        if (!apiKey) {
            const credits = await getUserCredits(user.id)
            if (credits <= 0) return NextResponse.json({ error: 'Sin saldo de créditos AI. Recarga en tu perfil.' }, { status: 400 })
            apiKey = (await getGlobalOpenAIKey()) ?? ''
            if (!apiKey) return NextResponse.json({ error: 'Configura tu API key de OpenAI en Configuración → IA para usar esta función.' }, { status: 400 })
            isGlobalKey = true
        }

        // Generate AI suggestions using user's configured model
        const suggestions = await generateStrategySuggestions(brief, apiKey, model)
        if (isGlobalKey) logAiUsage({ userId: user.id, service: 'ads-strategies', model, promptTokens: 2000, completionTokens: 1000 }).catch(() => {})

        // Delete old AI suggestions that are NOT referenced by any campaign AND not saved by user
        const usedStrategyIds = (await (prisma as any).adCampaignV2.findMany({
            where: { userId: user.id },
            select: { strategyId: true }
        })).map((c: any) => c.strategyId).filter(Boolean)

        await (prisma as any).adStrategy.deleteMany({
            where: {
                userId: user.id,
                isGlobal: false,
                savedByUser: false,
                ...(usedStrategyIds.length > 0 ? { id: { notIn: usedStrategyIds } } : {})
            }
        })

        // Save each suggestion to DB (so they have IDs for the existing campaign flow)
        const saved = []
        for (let i = 0; i < suggestions.length; i++) {
            const s = suggestions[i]
            const created = await (prisma as any).adStrategy.create({
                data: {
                    name: s.name,
                    // Encode reason inside description with separator — parsed on frontend
                    description: `${s.description}||REASON:${s.reason}`,
                    platform: s.platform,
                    objective: s.objective,
                    destination: s.destination,
                    mediaType: s.mediaType,
                    mediaCount: s.mediaCount,
                    minBudgetUSD: s.minBudgetUSD,
                    advantageType: s.advantageType,
                    isGlobal: false,
                    userId: user.id,
                    sortOrder: i,
                    isActive: true,
                }
            })
            saved.push({ ...created, description: s.description, reason: s.reason })
        }

        return NextResponse.json({ strategies: saved })
    } catch (err: any) {
        console.error('[StrategySuggest]', err)
        const message = err?.message || 'Error al generar estrategias con IA'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
