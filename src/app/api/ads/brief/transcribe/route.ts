export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/ads/encryption'
import { transcribeAudio } from '@/lib/ads/openai-ads'
import { getGlobalOpenAIKey, getUserCredits, logAiUsage } from '@/lib/ai-credits'

const ENC_KEY = process.env.ADS_ENCRYPTION_KEY || ''

export async function POST(req: Request) {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const oaiConfig = await (prisma as any).openAIConfig.findUnique({ where: { userId: user.id } })
    let apiKey = ''
    let isGlobalKey = false

    if (oaiConfig?.isValid && oaiConfig.apiKeyEnc) {
        try { apiKey = decrypt(oaiConfig.apiKeyEnc, ENC_KEY) } catch {}
    }

    if (!apiKey) {
        const credits = await getUserCredits(user.id)
        if (credits <= 0) return NextResponse.json({ error: 'Sin saldo de créditos AI. Recarga en tu perfil.' }, { status: 400 })
        apiKey = (await getGlobalOpenAIKey()) ?? ''
        if (!apiKey) return NextResponse.json({ error: 'Configura tu OpenAI API Key primero en Configuración' }, { status: 400 })
        isGlobalKey = true
    }

    // Parse multipart form
    const formData = await req.formData()
    const file = formData.get('audio') as File | null
    if (!file) return NextResponse.json({ error: 'No se recibió audio' }, { status: 400 })

    const maxSize = 25 * 1024 * 1024 // 25MB (OpenAI Whisper limit)
    if (file.size > maxSize) {
        return NextResponse.json({ error: 'El audio supera el límite de 25MB' }, { status: 400 })
    }

    try {
        const buffer = Buffer.from(await file.arrayBuffer())
        const text = await transcribeAudio(buffer, file.name || 'audio.webm', apiKey)

        if (!text || text.trim().length < 10) {
            return NextResponse.json({ error: 'No se pudo transcribir el audio. Asegúrate de hablar claramente.' }, { status: 422 })
        }

        if (isGlobalKey) logAiUsage({ userId: user.id, service: 'ads-transcribe', model: 'whisper-1', promptTokens: Math.ceil(file.size / 100), completionTokens: 0 }).catch(() => {})
        return NextResponse.json({ text: text.trim() })
    } catch (err: any) {
        console.error('[Transcribe]', err)
        return NextResponse.json({ error: err.message || 'Error al transcribir el audio' }, { status: 500 })
    }
}
