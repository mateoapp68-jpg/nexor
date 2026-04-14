async function expirePlans() {
    try {
        const { prisma } = await import('@/lib/prisma')
        const now = new Date()

        const expiredUsers = await prisma.$queryRaw<Array<{ id: string; plan: string }>>`
            SELECT id::text, plan::text FROM users
            WHERE plan != 'NONE'
              AND plan_expires_at IS NOT NULL
              AND plan_expires_at < ${now}
        `
        if (expiredUsers.length === 0) return

        const userIds = expiredUsers.map(u => u.id)
        await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`UPDATE users SET plan = 'NONE'::"UserPlan", plan_expires_at = NULL WHERE id = ANY(${userIds}::uuid[])`
            await tx.$executeRaw`UPDATE bots SET status = 'PAUSED'::"BotStatus" WHERE user_id = ANY(${userIds}::uuid[])`
            await tx.$executeRaw`UPDATE stores SET active = false WHERE user_id = ANY(${userIds}::uuid[])`
        })
        console.log(`[CRON] expire-plans: ${expiredUsers.length} planes vencidos desactivados`)
    } catch (err) {
        console.error('[CRON] expire-plans error:', err)
    }
}

export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        // ── Cron: expirar planes vencidos cada hora ──────────────────────────
        expirePlans() // ejecutar al iniciar también
        setInterval(expirePlans, 60 * 60 * 1000)

        // ── Reconectar bots Baileys en background (no bloquea el arranque) ──
        setTimeout(async () => {
            try {
                const { prisma } = await import('@/lib/prisma')
                const { BaileysManager } = await import('@/lib/baileys-manager')
                const { decrypt } = await import('@/lib/crypto')
                const { getGlobalOpenAIKey } = await import('@/lib/ai-credits')

                // Pre-cargar la key global una sola vez para todos los bots que no tengan key propia
                const globalKey = await getGlobalOpenAIKey()

                const bots = await prisma.bot.findMany({
                    where: {
                        type: 'BAILEYS',
                        status: 'ACTIVE',
                        baileysPhone: { not: null },
                    },
                    include: { secret: true },
                })

                for (const bot of bots) {
                    if (!bot.secret) continue

                    // Key propia del bot — fallback a key global
                    let openaiKey = ''
                    if (bot.secret.openaiApiKeyEnc) {
                        try { openaiKey = decrypt(bot.secret.openaiApiKeyEnc) } catch {}
                    }
                    if (!openaiKey && globalKey) openaiKey = globalKey

                    // Si no hay ninguna key disponible, saltar (pero no bloquear otros bots)
                    if (!openaiKey) {
                        console.warn(`[STARTUP] Bot ${bot.name} sin key de OpenAI — saltando reconexión`)
                        continue
                    }

                    console.log(`[STARTUP] Reconectando bot Baileys: ${bot.name}`)
                    BaileysManager.connect(bot.id, bot.name, openaiKey, bot.secret.reportPhone ?? '')
                        .catch(err => console.error(`[STARTUP] Error reconectando bot ${bot.id}:`, err))
                }
            } catch (err) {
                console.error('[STARTUP] Error al inicializar bots Baileys:', err)
            }
        }, 10_000) // 10s después de que el servidor esté listo
    }
}
