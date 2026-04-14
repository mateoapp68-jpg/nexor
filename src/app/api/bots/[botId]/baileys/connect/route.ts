export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { decrypt } from '@/lib/crypto'
import { BaileysManager } from '@/lib/baileys-manager'
import { getGlobalOpenAIKey, getUserCredits } from '@/lib/ai-credits'

function getAuth() {
    const token = cookies().get('auth_token')?.value
    if (!token) return null
    return verifyToken(token)
}

/** POST /api/bots/[botId]/baileys/connect — inicia la conexión y genera QR */
export async function POST(
    _req: NextRequest,
    { params }: { params: { botId: string } },
) {
    const auth = getAuth()
    if (!auth) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const bot = await prisma.bot.findFirst({
        where: { id: params.botId, userId: auth.userId, type: 'BAILEYS' },
        include: { secret: true },
    })
    if (!bot) return NextResponse.json({ error: 'Bot no encontrado' }, { status: 404 })
    if (!bot.secret) return NextResponse.json({ error: 'Configura las credenciales primero' }, { status: 400 })

    // Intentar key propia primero
    let openaiKey = ''
    if (bot.secret.openaiApiKeyEnc) {
        try { openaiKey = decrypt(bot.secret.openaiApiKeyEnc) } catch {}
    }

    // Fallback: key global si el usuario tiene saldo
    if (!openaiKey) {
        const credits = await getUserCredits(auth.userId)
        if (credits > 0) {
            openaiKey = (await getGlobalOpenAIKey()) ?? ''
        }
    }

    if (!openaiKey) {
        return NextResponse.json({ error: 'Configura tu OpenAI API Key o recarga créditos AI para usar el asistente' }, { status: 400 })
    }

    // Iniciar conexión en background (no esperar)
    BaileysManager.connect(
        bot.id,
        bot.name,
        openaiKey,
        bot.secret.reportPhone ?? '',
    ).catch(err => console.error('[BAILEYS] connect error:', err))

    return NextResponse.json({ ok: true })
}
