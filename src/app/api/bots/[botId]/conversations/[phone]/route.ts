import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import { sendText } from '@/lib/ycloud'
import { BaileysManager } from '@/lib/baileys-manager'
import { sendWaText } from '@/lib/whatsapp-cloud'
import { createNotification } from '@/lib/notifications'

type Params = { params: { botId: string; phone: string } }

async function getBotAndConv(botId: string, phone: string, userId: string) {
  const bot = await prisma.bot.findFirst({
    where: { id: botId, userId },
    include: { secret: true },
  })
  if (!bot) return { bot: null, conv: null }
  const decodedPhone = decodeURIComponent(phone)
  const conv = await prisma.conversation.findUnique({
    where: { botId_userPhone: { botId, userPhone: decodedPhone } },
  })
  return { bot, conv }
}

// GET — full message history
export async function GET(_req: NextRequest, { params }: Params) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { bot, conv } = await getBotAndConv(params.botId, params.phone, user.id)
  if (!bot) return NextResponse.json({ error: 'Bot no encontrado' }, { status: 404 })
  if (!conv) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 })

  const messages = await prisma.message.findMany({
    where: { conversationId: conv.id, buffered: false },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({ conversation: conv, messages })
}

// DELETE — delete messages only, reset bot state
export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { bot, conv } = await getBotAndConv(params.botId, params.phone, user.id)
  if (!bot) return NextResponse.json({ error: 'Bot no encontrado' }, { status: 404 })
  if (!conv) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 })

  await prisma.message.deleteMany({ where: { conversationId: conv.id } })
  await prisma.conversation.update({
    where: { id: conv.id },
    data: { sold: false, soldAt: null, followUp1At: null, followUp1Sent: false, followUp2At: null, followUp2Sent: false },
  })
  await prisma.botState.upsert({
    where: { conversationId: conv.id },
    update: { welcomeSent: false, welcomeSentAt: null, selectedProductId: null, lastIntent: null },
    create: { conversationId: conv.id, welcomeSent: false },
  })

  return NextResponse.json({ ok: true })
}

// PATCH — toggle botDisabled OR mark as sold manually
export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { bot, conv } = await getBotAndConv(params.botId, params.phone, user.id)
  if (!bot) return NextResponse.json({ error: 'Bot no encontrado' }, { status: 404 })
  if (!conv) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 })

  const body = await req.json() as { botDisabled?: boolean; markAsSold?: boolean; orderReport?: string }

  // ── Marcar venta manual ──────────────────────────────────────────────────────
  if (body.markAsSold) {
    const reportText = body.orderReport?.trim() ?? ''

    const updated = await prisma.conversation.update({
      where: { id: conv.id },
      data: {
        sold: true,
        soldAt: new Date(),
        botDisabled: true,
        orderReport: reportText,
      } as any,
    })

    // Enviar reporte al teléfono de reportes — igual que el bot automático
    if (reportText && bot.secret?.reportPhone) {
      const reportPhone = bot.secret.reportPhone.replace(/^\+/, '').replace(/\s/g, '')
      try {
        if (bot.type === 'YCLOUD') {
          const apiKey = decrypt(bot.secret.ycloudApiKeyEnc)
          const from = bot.secret.whatsappInstanceNumber
          await sendText(from, reportPhone, reportText, apiKey)
        } else if (bot.type === 'BAILEYS') {
          await BaileysManager.sendText(bot.id, reportPhone, reportText)
        }
        } else if (bot.type === 'WHATSAPP_CLOUD' && bot.secret?.metaPageTokenEnc && bot.secret?.metaPhoneNumberId) {
          const waToken = decrypt(bot.secret.metaPageTokenEnc as string)
          const waPhoneId = bot.secret.metaPhoneNumberId as string
          await sendWaText(reportPhone, reportText, waPhoneId, waToken)
        }
        // META: no tiene mecanismo de WhatsApp para reportar — solo notificación
      } catch (err) {
        console.error(`[PATCH markAsSold] sendReport error (${bot.type}):`, err)
      }
    }

    // Notificación push + campana
    createNotification(
      user.id,
      `📞 Venta manual — ${bot.name}`,
      reportText.slice(0, 120) || 'Venta registrada manualmente',
      '/dashboard/services/whatsapp',
    ).catch(() => {})

    return NextResponse.json({ conversation: updated })
  }

  // ── Toggle botDisabled ───────────────────────────────────────────────────────
  const newVal = typeof body.botDisabled === 'boolean' ? body.botDisabled : !conv.botDisabled
  const updated = await prisma.conversation.update({ where: { id: conv.id }, data: { botDisabled: newVal } })

  return NextResponse.json({ conversation: updated })
}

// POST — send a manual text message to the contact (YCLOUD and WHATSAPP_CLOUD)
export async function POST(req: NextRequest, { params }: Params) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { bot, conv } = await getBotAndConv(params.botId, params.phone, user.id)
  if (!bot) return NextResponse.json({ error: 'Bot no encontrado' }, { status: 404 })
  if (!conv) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 })
  if (!bot.secret) return NextResponse.json({ error: 'Bot sin credenciales' }, { status: 400 })
  if (!['YCLOUD', 'WHATSAPP_CLOUD'].includes(bot.type)) {
    return NextResponse.json({ error: 'El envío manual no está disponible para este tipo de bot' }, { status: 400 })
  }

  const body = await req.json() as { text?: string }
  const text = body.text?.trim()
  if (!text) return NextResponse.json({ error: 'Texto vacío' }, { status: 400 })

  const to = conv.userPhone.replace(/\D/g, '')

  try {
    if (bot.type === 'YCLOUD') {
      const apiKey = decrypt(bot.secret.ycloudApiKeyEnc)
      const from = bot.secret.whatsappInstanceNumber
      await sendText(from, to, text, apiKey)
    } else {
      // WHATSAPP_CLOUD
      const waToken = decrypt(bot.secret.metaPageTokenEnc as string)
      const waPhoneId = bot.secret.metaPhoneNumberId as string
      if (!waToken || !waPhoneId) {
        return NextResponse.json({ error: 'Bot sin token o Phone Number ID configurados' }, { status: 400 })
      }
      await sendWaText(to, text, waPhoneId, waToken)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error enviando mensaje'
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  const msg = await prisma.message.create({
    data: {
      conversationId: conv.id,
      role: 'assistant',
      type: 'text',
      content: JSON.stringify({ mensaje1: text, mensaje2: null, mensaje3: null, fotos_mensaje1: [], videos_mensaje1: [], reporte: '' }),
      buffered: false,
    },
  })

  return NextResponse.json({ message: msg })
}
