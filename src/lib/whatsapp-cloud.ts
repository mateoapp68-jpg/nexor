/**
 * WhatsApp Cloud API client (Meta official API).
 * Uses /{phoneNumberId}/messages endpoint with Bearer token.
 * Completely different from meta.ts which is for Facebook Messenger.
 */

const WA_API_VERSION = 'v20.0'
const WA_BASE = `https://graph.facebook.com/${WA_API_VERSION}`

async function waPost(
  phoneNumberId: string,
  token: string,
  body: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(`${WA_BASE}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`[WA_CLOUD] API error ${res.status}: ${err}`)
  }
}

/** Send plain text to a WhatsApp number */
export async function sendWaText(
  to: string,
  text: string,
  phoneNumberId: string,
  token: string,
): Promise<void> {
  await waPost(phoneNumberId, token, {
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { preview_url: false, body: text },
  })
}

/** Send an image (by URL) to a WhatsApp number */
export async function sendWaImage(
  to: string,
  imageUrl: string,
  phoneNumberId: string,
  token: string,
  caption?: string,
): Promise<void> {
  await waPost(phoneNumberId, token, {
    recipient_type: 'individual',
    to,
    type: 'image',
    image: { link: imageUrl, ...(caption ? { caption } : {}) },
  })
}

/** Send a video (by URL) to a WhatsApp number */
export async function sendWaVideo(
  to: string,
  videoUrl: string,
  phoneNumberId: string,
  token: string,
  caption?: string,
): Promise<void> {
  await waPost(phoneNumberId, token, {
    recipient_type: 'individual',
    to,
    type: 'video',
    video: { link: videoUrl, ...(caption ? { caption } : {}) },
  })
}

/** Send an audio message (PTT voice note) by URL */
export async function sendWaAudio(
  to: string,
  audioUrl: string,
  phoneNumberId: string,
  token: string,
): Promise<void> {
  await waPost(phoneNumberId, token, {
    recipient_type: 'individual',
    to,
    type: 'audio',
    audio: { link: audioUrl },
  })
}

/** Mark a message as read (shows blue ticks) */
export async function markWaAsRead(
  messageId: string,
  phoneNumberId: string,
  token: string,
): Promise<void> {
  try {
    await waPost(phoneNumberId, token, {
      status: 'read',
      message_id: messageId,
    })
  } catch { /* ignore — non-critical */ }
}
