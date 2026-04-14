/**
 * AI Credits — gestiona saldo de créditos por usuario y registra uso de OpenAI.
 * El admin configura una API key global en AppSetting con key 'openai_global_key' (encriptada).
 * Cada llamada descuenta del saldo aiCreditsUsd del usuario.
 */

import { prisma } from '@/lib/prisma'
import { encrypt, decrypt } from '@/lib/crypto'

// ─── Resolved OpenAI key (propia o global) ────────────────────────────────────

export interface ResolvedKey {
  key: string
  isGlobal: boolean
  userId: string
}

/**
 * Resuelve la API key de OpenAI para un bot:
 * 1. Prioriza la key propia del bot (BotSecret.openaiApiKeyEnc)
 * 2. Si no tiene, usa la key global del admin — solo si el usuario tiene saldo positivo
 * Devuelve null si no hay key disponible o no hay saldo para usar la global.
 */
export async function resolveOpenAIKey(botId: string): Promise<ResolvedKey | null> {
  // 1. Buscar key propia en BotSecret
  const secret = await (prisma as any).botSecret.findUnique({ where: { botId } })
  if (secret?.openaiApiKeyEnc) {
    try {
      const key = decrypt(secret.openaiApiKeyEnc)
      if (key) {
        const bot = await prisma.bot.findUnique({ where: { id: botId }, select: { userId: true } })
        return { key, isGlobal: false, userId: bot?.userId ?? '' }
      }
    } catch { /* key corrupta, continuar */ }
  }

  // 2. Fallback: key global — solo si el usuario tiene saldo
  const bot = await prisma.bot.findUnique({ where: { id: botId }, select: { userId: true } })
  if (!bot) return null

  const user = await prisma.user.findUnique({ where: { id: bot.userId }, select: { aiCreditsUsd: true } })
  if (!user || user.aiCreditsUsd <= 0) {
    console.warn(`[AI-CREDITS] Bot ${botId}: sin key propia y sin saldo (${user?.aiCreditsUsd ?? 0} USD) — bloqueado`)
    return null
  }

  const globalKey = await getGlobalOpenAIKey()
  if (!globalKey) return null

  return { key: globalKey, isGlobal: true, userId: bot.userId }
}

// ─── Precios por modelo (USD por 1M tokens) ───────────────────────────────────
const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  'gpt-4o':          { input: 2.50,  output: 10.00 },
  'gpt-4o-mini':     { input: 0.15,  output: 0.60  },
  'gpt-4-turbo':     { input: 10.00, output: 30.00 },
  'gpt-3.5-turbo':   { input: 0.50,  output: 1.50  },
  'gpt-5.1':         { input: 2.50,  output: 10.00 },
  'gpt-5.2':         { input: 2.50,  output: 10.00 },
  'whisper-1':       { input: 0.006, output: 0      }, // por minuto aprox
}

export function calcCostUsd(model: string, promptTokens: number, completionTokens: number): number {
  const price = MODEL_PRICES[model] ?? { input: 2.50, output: 10.00 }
  return (promptTokens / 1_000_000) * price.input + (completionTokens / 1_000_000) * price.output
}

// ─── API Key global ────────────────────────────────────────────────────────────

export async function getGlobalOpenAIKey(): Promise<string | null> {
  const setting = await prisma.appSetting.findUnique({ where: { key: 'openai_global_key' } })
  if (!setting?.value) return null
  try {
    return decrypt(setting.value)
  } catch {
    return null
  }
}

export async function setGlobalOpenAIKey(plainKey: string): Promise<void> {
  const encrypted = encrypt(plainKey)
  await prisma.appSetting.upsert({
    where: { key: 'openai_global_key' },
    create: { key: 'openai_global_key', value: encrypted },
    update: { value: encrypted },
  })
}

// ─── Créditos ─────────────────────────────────────────────────────────────────

export async function getUserCredits(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { aiCreditsUsd: true },
  })
  return user?.aiCreditsUsd ?? 0
}

export async function addCredits(userId: string, amountUsd: number): Promise<number> {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { aiCreditsUsd: { increment: amountUsd } },
    select: { aiCreditsUsd: true },
  })
  return updated.aiCreditsUsd
}

export async function deductCredits(userId: string, amountUsd: number): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { aiCreditsUsd: { decrement: amountUsd } },
  })
}

// ─── Registrar uso ────────────────────────────────────────────────────────────

export async function logAiUsage(opts: {
  userId: string
  service: string
  model: string
  promptTokens: number
  completionTokens: number
}): Promise<number> {
  const costUsd = calcCostUsd(opts.model, opts.promptTokens, opts.completionTokens)

  await prisma.$transaction([
    (prisma as any).aiUsageLog.create({
      data: {
        userId: opts.userId,
        service: opts.service,
        model: opts.model,
        promptTokens: opts.promptTokens,
        completionTokens: opts.completionTokens,
        costUsd,
      },
    }),
    prisma.user.update({
      where: { id: opts.userId },
      data: { aiCreditsUsd: { decrement: costUsd } },
    }),
  ])

  return costUsd
}

// ─── Historial de uso ─────────────────────────────────────────────────────────

export async function getUserUsageLogs(userId: string, limit = 20) {
  return (prisma as any).aiUsageLog.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
}

export async function getUserUsageSummary(userId: string) {
  const logs = await (prisma as any).aiUsageLog.findMany({
    where: { userId },
    select: { costUsd: true, service: true, createdAt: true },
  })

  const totalSpent = logs.reduce((sum: number, l: any) => sum + l.costUsd, 0)
  const byService: Record<string, number> = {}
  for (const log of logs) {
    byService[log.service] = (byService[log.service] ?? 0) + log.costUsd
  }

  return { totalSpent, byService, callCount: logs.length }
}
