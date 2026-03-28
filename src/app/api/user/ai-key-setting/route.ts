export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getGlobalOpenAIKey } from '@/lib/ai-credits'

/** GET — devuelve si el usuario usa la key global y si está disponible */
export async function GET() {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const rows = await prisma.$queryRaw<Array<{ use_global_ai_key: boolean }>>`
        SELECT use_global_ai_key FROM users WHERE id = ${user.id}::uuid LIMIT 1
    `
    const globalKeyAvailable = !!(await getGlobalOpenAIKey())

    return NextResponse.json({
        useGlobalAiKey: rows[0]?.use_global_ai_key ?? false,
        globalKeyAvailable,
    })
}

/** PATCH — activa o desactiva el uso de la key global */
export async function PATCH(req: NextRequest) {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { useGlobalAiKey } = await req.json()

    if (useGlobalAiKey) {
        const globalKeyAvailable = !!(await getGlobalOpenAIKey())
        if (!globalKeyAvailable) {
            return NextResponse.json({ error: 'El administrador aún no ha configurado la API key global.' }, { status: 400 })
        }
        if (user.aiCreditsUsd !== undefined && (user as any).aiCreditsUsd <= 0) {
            // Permitir igualmente — el admin puede dar créditos después
        }
    }

    await prisma.$executeRaw`
        UPDATE users SET use_global_ai_key = ${useGlobalAiKey} WHERE id = ${user.id}::uuid
    `

    return NextResponse.json({ ok: true, useGlobalAiKey })
}
