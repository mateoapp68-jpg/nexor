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

/** Send a template message (for cold outreach — no 24h window restriction) */
export async function sendWaTemplate(
  to: string,
  templateName: string,
  languageCode: string,
  phoneNumberId: string,
  token: string,
  bodyVars?: string[],   // values for {{1}}, {{2}}, ... in body
): Promise<void> {
  const components: unknown[] = []
  if (bodyVars && bodyVars.length > 0) {
    components.push({
      type: 'body',
      parameters: bodyVars.map(v => ({ type: 'text', text: v })),
    })
  }
  await waPost(phoneNumberId, token, {
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components.length > 0 && { components }),
    },
  })
}

/** List templates for a WABA — returns raw Meta response */
export async function listWaTemplates(wabaId: string, token: string): Promise<unknown> {
  const url = `${WA_BASE}/${wabaId}/message_templates?fields=id,name,status,language,category,components&limit=250`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`[WA_CLOUD] listTemplates error ${res.status}: ${err}`)
  }
  return res.json()
}

export interface WaTemplateButton {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'COPY_CODE'
  text: string
  url?: string          // for URL buttons
  phone_number?: string // for PHONE_NUMBER buttons
  example?: string      // for COPY_CODE buttons (example coupon code)
}

export interface WaTemplatePayload {
  name: string
  language: string
  category: string
  bodyText: string
  headerType?: 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'
  headerText?: string
  headerMediaUrl?: string
  footerText?: string
  buttons?: WaTemplateButton[]
}

/** Create a template and submit for Meta review */
export async function createWaTemplate(
  wabaId: string,
  token: string,
  payload: WaTemplatePayload,
): Promise<unknown> {
  const { name, language, category, bodyText, headerType, headerText, headerMediaUrl, footerText, buttons } = payload
  const components: unknown[] = []

  // Helper: count {{N}} variables in a string
  function countVars(text: string): number {
    return (text.match(/\{\{\d+\}\}/g) ?? []).length
  }

  // Header component
  if (headerType && headerType !== 'NONE') {
    if (headerType === 'TEXT' && headerText?.trim()) {
      const headerVarCount = countVars(headerText.trim())
      components.push({
        type: 'HEADER',
        format: 'TEXT',
        text: headerText.trim(),
        ...(headerVarCount > 0 && {
          example: { header_text: Array.from({ length: headerVarCount }, (_, i) => `Ejemplo${i + 1}`) },
        }),
      })
    } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerType)) {
      components.push({
        type: 'HEADER',
        format: headerType,
        ...(headerMediaUrl?.trim() && {
          example: { header_url: [headerMediaUrl.trim()] },
        }),
      })
    }
  }

  // Body — if has variables, include example values (required by Meta)
  const bodyVarCount = countVars(bodyText)
  components.push({
    type: 'BODY',
    text: bodyText,
    ...(bodyVarCount > 0 && {
      example: {
        body_text: [Array.from({ length: bodyVarCount }, (_, i) => `Ejemplo${i + 1}`)],
      },
    }),
  })

  // Footer
  if (footerText?.trim()) {
    components.push({ type: 'FOOTER', text: footerText.trim() })
  }

  // Buttons
  if (buttons && buttons.length > 0) {
    components.push({
      type: 'BUTTONS',
      buttons: buttons.map(b => {
        if (b.type === 'QUICK_REPLY')  return { type: 'QUICK_REPLY', text: b.text }
        if (b.type === 'URL')          return { type: 'URL', text: b.text, url: b.url }
        if (b.type === 'COPY_CODE')    return { type: 'COPY_CODE', example: [b.example?.trim() || 'EJEMPLO123'] }
        return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phone_number }
      }),
    })
  }

  const url = `${WA_BASE}/${wabaId}/message_templates`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name, language, category, components }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`[WA_CLOUD] createTemplate error ${res.status}: ${err}`)
  }
  return res.json()
}

/** Delete a template by name */
export async function deleteWaTemplate(wabaId: string, token: string, name: string): Promise<void> {
  const url = `${WA_BASE}/${wabaId}/message_templates?name=${encodeURIComponent(name)}`
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`[WA_CLOUD] deleteTemplate error ${res.status}: ${err}`)
  }
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
