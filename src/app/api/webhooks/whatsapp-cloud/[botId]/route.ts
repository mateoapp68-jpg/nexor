export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { WhatsAppCloudEngine } from '@/lib/whatsapp-cloud-engine'

/**
 * GET – WhatsApp Cloud webhook verification challenge.
 * Meta sends: hub.mode=subscribe, hub.verify_token, hub.challenge
 * We verify the token against the bot's webhookToken and echo back the challenge.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { botId: string } },
) {
  const { searchParams } = new URL(req.url)
  const mode      = searchParams.get('hub.mode')
  const token     = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode !== 'subscribe' || !token || !challenge) {
    return new NextResponse('Bad Request', { status: 400 })
  }

  const bot = await prisma.bot.findFirst({
    where: { id: params.botId, type: 'WHATSAPP_CLOUD' },
    select: { webhookToken: true },
  })

  if (!bot || bot.webhookToken !== token) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  return new NextResponse(challenge, { status: 200 })
}

/**
 * POST – receive WhatsApp Cloud messages.
 * Payload shape:
 * {
 *   object: 'whatsapp_business_account',
 *   entry: [{
 *     changes: [{
 *       value: {
 *         messages: [...],
 *         contacts: [...],
 *         statuses: [...],   // delivery/read receipts — ignored
 *       }
 *     }]
 *   }]
 * }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { botId: string } },
) {
  try {
    const body = await req.json() as Record<string, unknown>

    // Only handle whatsapp_business_account events
    if (body.object !== 'whatsapp_business_account') {
      return NextResponse.json({ ok: true })
    }

    const entries = (body.entry as Array<Record<string, unknown>>) ?? []
    for (const entry of entries) {
      const changes = (entry.changes as Array<Record<string, unknown>>) ?? []
      for (const change of changes) {
        if (change.field !== 'messages') continue

        const value    = (change.value as Record<string, unknown>) ?? {}
        const messages = (value.messages as Array<Record<string, unknown>>) ?? []
        const contacts = (value.contacts as Array<Record<string, unknown>>) ?? []

        for (const msg of messages) {
          // Ignore status updates (delivery/read receipts)
          if (!msg.from || !msg.id) continue

          // Process async — respond 200 immediately to Meta
          WhatsAppCloudEngine.handleMessage(params.botId, msg, contacts).catch(e =>
            console.error('[WA_CLOUD] handleMessage error:', e),
          )
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[WA_CLOUD] webhook POST error:', e)
    return NextResponse.json({ ok: true }) // always 200 to Meta
  }
}
