/**
 * BotEngine – core processing logic for WhatsApp bots.
 * Handles incoming YCloud webhook payloads end-to-end.
 *
 * ─── SISTEMA DE BUFFER ────────────────────────────────────────────────────────
 * Cuando un usuario envía varios mensajes rápido (texto + audio + imagen):
 *  1. Cada mensaje llega, se transcribe/analiza y se guarda como buffered=true
 *  2. Se espera BUFFER_DELAY_MS (15 sg) para acumular todos los mensajes
 *  3. El ÚLTIMO mensaje en llegar es el "ganador" y procesa todos juntos
 *  4. Los mensajes buffered se eliminan de DB y se combinan en 1 solo contexto
 *  5. Ese contexto combinado se envía a OpenAI para generar la respuesta
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { prisma } from './prisma'
import { decrypt } from './crypto'
import { transcribeAudio, analyzeImage, chatWithUsage, ChatMessage, BotJsonResponse } from './openai'
import { markAsRead, sendText, sendImage, sendVideo } from './ycloud'
import { createNotification } from './notifications'
import { resolveOpenAIKey, logAiUsage } from './ai-credits'

/** Tiempo de espera del buffer en milisegundos (15 segundos). */
const BUFFER_DELAY_MS = 15_000

/** Máximo de mensajes de historial previo que se pasan a OpenAI. */
const MAX_HISTORY_MESSAGES = 6

/** Pausa de N milisegundos. */
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

// ─── YCloud payload normalization ─────────────────────────────────────────────

interface NormalizedMessage {
  msgId: string
  userPhone: string
  userName: string
  type: 'text' | 'audio' | 'image' | 'location'
  text?: string
  audioUrl?: string
  imageUrl?: string
  locationLat?: number
  locationLon?: number
}

function normalizePayload(payload: Record<string, unknown>): NormalizedMessage | null {
  try {
    // YCloud v2 real format: { type, whatsappInboundMessage: { id, wamid, from, type, text, ... } }
    // Fallbacks for other envelope styles
    const msg =
      payload.whatsappInboundMessage ??
      (payload.data as Record<string, unknown>)?.message ??
      payload.message ??
      payload

    const m = msg as Record<string, unknown>

    // Usar wamid como ID de deduplicación (ID real de WhatsApp)
    const msgId = (m.wamid ?? m.id ?? m.messageId ?? '') as string
    const userPhone = (m.from ?? '') as string
    const profile = (m.customerProfile ?? m.contact ?? {}) as Record<string, unknown>
    let userName = ((profile.name ?? profile.displayName ?? '') as string) || ''

    // Si el nombre es puramente numérico, es un fallback del teléfono, lo limpiamos
    if (userName && /^\d+$/.test(userName.replace(/[+\s-]/g, ''))) {
      userName = ''
    }

    const type = (m.type ?? 'text') as string

    if (!userPhone) return null

    if (type === 'text') {
      const textObj = m.text as Record<string, unknown> | undefined
      const body = (textObj?.body ?? m.body ?? '') as string
      return { msgId, userPhone, userName, type: 'text', text: body }
    }

    if (type === 'audio' || type === 'voice') {
      const audioObj = (m.audio ?? m.voice ?? {}) as Record<string, unknown>
      const audioUrl = (audioObj.link ?? audioObj.url ?? audioObj.id ?? '') as string
      return { msgId, userPhone, userName, type: 'audio', audioUrl }
    }

    if (type === 'image') {
      const imgObj = (m.image ?? {}) as Record<string, unknown>
      const imageUrl = (imgObj.link ?? imgObj.url ?? imgObj.id ?? '') as string
      return { msgId, userPhone, userName, type: 'image', imageUrl }
    }

    if (type === 'location') {
      const loc = (m.location ?? {}) as Record<string, unknown>
      return {
        msgId,
        userPhone,
        userName,
        type: 'location',
        locationLat: (loc.latitude ?? loc.lat) as number,
        locationLon: (loc.longitude ?? loc.lon ?? loc.lng) as number,
        text: `${loc.name || ''} ${loc.address || ''}`.trim(),
      }
    }

    // Mensajes de sistema de WhatsApp (anuncios CTWA, consentimiento de datos, etc.) — ignorar
    if (type === 'system' || type === 'notification' || type === 'action') {
      return null
    }

    // Tipo desconocido – tratar como texto solo si hay contenido real
    const unknownText = (m.body ?? m.text ?? '') as string
    if (!unknownText.trim()) return null
    return { msgId, userPhone, userName, type: 'text', text: unknownText }
  } catch {
    return null
  }
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

/** Extrae todas las URLs (fotos + videos) ya enviadas en mensajes anteriores del asistente */
export function extractSentUrls(messages: Array<{ role: string; content: string }>): string[] {
  const urls: string[] = []
  for (const m of messages) {
    if (m.role !== 'assistant') continue
    try {
      const parsed = JSON.parse(m.content) as Record<string, unknown>
      const fotos = Array.isArray(parsed.fotos_mensaje1) ? parsed.fotos_mensaje1 as string[] : []
      const videos = Array.isArray(parsed.videos_mensaje1) ? parsed.videos_mensaje1 as string[] : []
      urls.push(...fotos, ...videos)
    } catch { /* mensaje no JSON — ignorar */ }
  }
  const filtered = urls.filter(u => typeof u === 'string' && u.startsWith('http'))
  return Array.from(new Set(filtered))
}

export function buildSystemPrompt(
  bot: { name: string; systemPromptTemplate: string | null; maxCharsMensaje1: number | null; maxCharsMensaje2: number | null; maxCharsMensaje3: number | null },
  products: Array<Record<string, unknown>>,
  userName?: string | null,
  userPhone?: string | null,
  identifiedProductIds?: string[],
  sentUrls?: string[],
  welcomeSent?: boolean,
): string {
  // Limpieza final: si userName parece un teléfono, usar 'cliente'
  const isNumeric = userName && /^\d+$/.test(userName.replace(/[+\s-]/g, ''))
  const nameToUse = (userName && !isNumeric) ? userName : 'cliente'

  const currencySymbols: Record<string, string> = {
    USD: '$', EUR: '€', BOB: 'Bs.', PEN: 'S/',
    COP: '$', ARS: '$', MXN: '$', CLP: '$', UYU: '$', CUP: '$',
    GTQ: 'Q', HNL: 'L', NIO: 'C$', CRC: '₡',
    PAB: 'B/.', DOP: 'RD$', PYG: '₲', BRL: 'R$', VES: 'Bs.S',
  }

  const productBlock = products
    .map(p => {
      const currency = (p.currency as string | undefined) ?? 'USD'
      const sym = currencySymbols[currency] ?? currency

      // Smart filter: si se detectaron productos, los no mencionados van con info mínima (sin URLs)
      if (identifiedProductIds?.length && !identifiedProductIds.includes(p.id as string)) {
        return [
          `### PRODUCTO: ${p.name}`,
          p.priceUnit   ? `- Precio unitario: ${sym}${p.priceUnit} (${currency})` : '',
          p.pricePromo2 ? `- Precio promo ×2: ${sym}${p.pricePromo2} (${currency})` : '',
          p.priceSuper6 ? `- Precio súper ×6: ${sym}${p.priceSuper6} (${currency})` : '',
        ].filter(Boolean).join('\n')
      }

      const allImgs = Array.isArray(p.imageMainUrls) ? (p.imageMainUrls as string[]) : []
      const mainImgs = allImgs.slice(0, 3)
      const moreImgs = allImgs.slice(3, 8)

      const hooks = Array.isArray(p.hooks) ? (p.hooks as string[]) : []

      const rawTestis = Array.isArray(p.testimonialsVideoUrls) ? p.testimonialsVideoUrls : []
      // Split into image testimonials vs video testimonials
      const testimonialsImages = (rawTestis as Array<unknown>)
        .map(item => {
          if (typeof item === 'object' && item !== null) {
            const obj = item as { url: string; label?: string; type?: string }
            if (obj.type === 'video') return null // skip videos here
            if (obj.url?.startsWith('http')) return { url: obj.url, label: obj.label || '' }
          }
          if (typeof item === 'string' && item.startsWith('http')) return { url: item, label: '' }
          return null
        })
        .filter((t): t is { url: string; label: string } => t !== null)

      const testimonialsVideos = (rawTestis as Array<unknown>)
        .map(item => {
          if (typeof item === 'object' && item !== null) {
            const obj = item as { url: string; label?: string; type?: string }
            if (obj.type === 'video' && obj.url?.startsWith('http')) return { url: obj.url, label: obj.label || '' }
          }
          return null
        })
        .filter((t): t is { url: string; label: string } => t !== null)

      // Product videos stored in imageMainUrls with type='video' via a separate JSON field
      const rawProductVideos = Array.isArray((p as any).productVideoUrls) ? (p as any).productVideoUrls as string[] : []

      return [
        `### PRODUCTO: ${p.name}`,
        p.category ? `Categoría: ${p.category}` : '',
        p.benefits ? `Beneficios: ${p.benefits}` : '',
        p.usage ? `Uso: ${p.usage}` : '',
        p.warnings ? `Advertencias: ${p.warnings}` : '',
        // Omitir firstMessage y foto principal si ya fueron enviados (ahorra 300-400 tokens)
        !welcomeSent ? `Primer mensaje del producto identificado: "${p.firstMessage || ''}"` : '',
        !welcomeSent ? `Imágenes principales (enviar 1): ${JSON.stringify(mainImgs)}` : '',
        `Precios: unitario=${sym}${p.priceUnit ?? '—'} | ×2=${sym}${p.pricePromo2 ?? '—'} | ×6=${sym}${p.priceSuper6 ?? '—'}`,
        `Más fotos: ${JSON.stringify(moreImgs)}`,
        rawProductVideos.length > 0 ? `Videos producto: ${JSON.stringify(rawProductVideos)}` : '',
        `Fotos testimonios: ${JSON.stringify(testimonialsImages)}`,
        testimonialsVideos.length > 0 ? `Videos testimonios: ${JSON.stringify(testimonialsVideos)}` : '',
        p.shippingInfo ? `Envío: ${p.shippingInfo}` : '',
        p.coverage ? `Cobertura: ${p.coverage}` : '',
        hooks.length > 0 ? `Gatillos: ${hooks.join(', ')}` : '',
      ].filter(Boolean).join('\n')
    })
    .join('\n\n')

  const maxM1 = bot.maxCharsMensaje1 && bot.maxCharsMensaje1 > 0 ? bot.maxCharsMensaje1 : null
  const maxM2 = bot.maxCharsMensaje2 && bot.maxCharsMensaje2 > 0 ? bot.maxCharsMensaje2 : null
  const maxM3 = bot.maxCharsMensaje3 && bot.maxCharsMensaje3 > 0 ? bot.maxCharsMensaje3 : null

  const customPrompt = bot.systemPromptTemplate?.trim()

  // Si el usuario tiene su propio prompt → lo usa como flujo completo.
  // Se inyectan: datos del cliente, límites de chars del panel, catálogo y formato de salida.
  const sentUrlsBlock = sentUrls && sentUrls.length > 0 ? `

---

# 🚫 URLs YA ENVIADAS — COMPLETAMENTE PROHIBIDO REPETIRLAS

Las siguientes URLs ya fueron enviadas en esta conversación. JAMÁS las incluyas en fotos_mensaje1 ni videos_mensaje1. Si la única URL disponible ya fue enviada, deja el array vacío [].

${sentUrls.map(u => `- ${u}`).join('\n')}` : ''

  if (customPrompt) {
    const charLimitsSection = (maxM1 || maxM2 || maxM3) ? `

---

# 📏 LÍMITES DE CARACTERES (OBLIGATORIO — NO NEGOCIABLE)

- mensaje1: ${!welcomeSent ? 'SIN LÍMITE — este turno debes enviar el primer mensaje del producto COMPLETO, sin recortar.' : maxM1 ? `máx. ${maxM1} caracteres.` : 'sin límite.'}
- mensaje2: ${maxM2 ? `máx. ${maxM2} caracteres.` : 'sin límite.'}
- mensaje3: ${maxM3 ? `máx. ${maxM3} caracteres.` : 'sin límite.'}` : ''

    return `
# 👤 CLIENTE ACTUAL

- Nombre: ${nameToUse}
- Género: detectar por el nombre y usar el trato correspondiente del prompt (señorita/casera si mujer, estimado/amigo si hombre). Si el nombre es genérico o desconocido, usar trato neutro.
- Teléfono: ${userPhone ? userPhone.replace(/^\+/, '') : 'desconocido'}
- Primer mensaje del producto: ${welcomeSent ? 'YA FUE ENVIADO — NO repetirlo ni la foto principal' : 'AÚN NO enviado — cuando identifiques el producto, copia y envía su texto COMPLETO y EXACTO en mensaje1, sin resumir ni recortar, aunque tenga 600+ caracteres. El límite de caracteres NO aplica para este primer mensaje.'}

---

${customPrompt}
${charLimitsSection}
${sentUrlsBlock}

---

# 🧩 BASE DE CONOCIMIENTO (CATÁLOGO)

${productBlock}

---

# 📦 FORMATO DE SALIDA (OBLIGATORIO — NO NEGOCIABLE)

Responde SIEMPRE con este JSON exacto, sin texto fuera del JSON.

Regla de mensajes:
- mensaje1: SIEMPRE requerido.
- mensaje2: SOLO para un gatillo mental o pregunta clave de cierre. Si no es necesario, dejar "".
- mensaje3: SOLO si es imprescindible (muy raro). Si no, dejar "".
- En la mayoría de turnos solo va mensaje1.

\`\`\`json
{
  "mensaje1": "Texto principal del turno",
  "mensaje2": "",
  "mensaje3": "",
  "fotos_mensaje1": [],
  "videos_mensaje1": [],
  "reporte": ""
}
\`\`\`
`.trim()
  }

  // Sin prompt personalizado → flujo por defecto completo
  const identityBlock = `Eres ${bot.name}, vendedor profesional de WhatsApp. Amable, directo y humano.\n\nTono: corto, cálido, cercano.\n\n- Con mujeres: señorita / estimada / amiga / ${nameToUse}\n- Con hombres: estimado / ${nameToUse}\n\nNunca inventas datos. Siempre presionas de forma ética hacia la compra.`

  return `
# 👤 CLIENTE ACTUAL

- Nombre: ${nameToUse}
- Género: detectar por el nombre y usar el trato correspondiente (señorita/casera si mujer, estimado/amigo si hombre). Si es genérico o desconocido, usar trato neutro.
- Teléfono: ${userPhone ? userPhone.replace(/^\+/, '') : 'desconocido'}
- Primer mensaje del producto: ${welcomeSent ? 'YA FUE ENVIADO — NO repetirlo ni la foto principal' : 'AÚN NO enviado — enviar en este turno si el producto está identificado'}

---

# 🎯 IDENTIDAD

${identityBlock}

---

# 🧠 SECUENCIA PRINCIPAL

## 1. Dar un bienvenida cálida y amigable y luego Identificación del producto (OBLIGATORIO)

Primero dar una bienvenida calida y amigable.

Luego identifica el producto de interés (obligatorio).

Si no está identificado:

- NO envíes bienvenida, precios, fotos ni beneficios.
- Pregunta amablemente: "¿Qué producto te interesa?"

El flujo no avanza hasta que el producto esté identificado.

---

## 2. Primera interacción (solo si el producto ya fue identificado)

Si es la primera vez que el usuario consulta sobre ese producto:

- Enviar el texto exacto del campo "Primer mensaje del producto identificado".
- NO incluir precios en este mensaje.
- Enviar 1 foto de "Imágenes principales" en fotos_mensaje1 (solo se puede enviar una vez).
- Añadir gatillos mentales suaves: transformación, autoridad, prueba social.

Una vez enviado el primer mensaje y la primera foto "Imágenes principales"  → no repetirlo en ningún turno posterior.

---

## 3. Detección de intención

Detecta una sola intención dominante por turno:
Interés / Duda / Precio / Comparación / Compra / Entrega

Máximo 3 mensajes por turno.

---

## 4. Precios

Solo informa precios si el usuario los solicita explícitamente.

- Precio unitario → cuando quiere 1 unidad.
- Precio promo ×2 o Precio súper ×6 → cuando quiere 2 o más unidades.

Usa gatillos de: ahorro, urgencia y beneficio inmediato.

NUNCA inventas montos. Usa solo los precios de la base de conocimiento del producto.

## 5. Fotos y videos del producto (usar según lo que pida el cliente)

- Si el usuario pide **fotos** → envía desde “**Más fotos del producto**” en fotos_mensaje1.
- Si el usuario pide **ver el producto en acción** o pide un **video** → envía desde “**Videos del producto**” en videos_mensaje1.
- Puedes combinar: una foto Y un video en el mismo turno si el cliente quiere ver más.
- Nunca repitas la misma URL ya enviada en la conversación.

---

## 6. Testimonios y confianza (usar testimonios solo si existen)

Si detectas duda, inseguridad o el usuario pide evidencias o testimonios, o deseas reforzar la confianza:

- Usa **fotos de testimonios** (desde “Fotos de testimonios”) Y/O **videos de testimonios** (desde “Videos de testimonios”) según lo que tengas disponible.
- Si tienes tanto fotos como videos de testimonios, puedes enviar uno de cada tipo en el mismo turno para mayor impacto.
- Si el cliente pide específicamente un video testimonio → usa “Videos de testimonios”.
- Si el cliente pide fotos de resultados → usa “Fotos de testimonios”.
- No repitas la misma foto o video en la misma conversación.
- Acompaña siempre con un mensaje de prueba social y credibilidad.

---

## **7. Comparación y cierre**

Guía suave hacia la decisión:

- Resaltar beneficios del producto.
- Mostrar resultados potenciales o transformación (sin inventar).
- Los mensajes deben avanzar hacia:
    - Confirmación de compra
    - Datos de entrega
    - Selección de variante

Siempre con amabilidad y claridad.

---

# 📍 **DIRECCIÓN**

Válida si incluye:

- Ciudad
- Calle
- Zona
- Nº (si existe)
    
    o coordenadas / link Maps.
    

Si falta algo → pedir solo lo faltante o direccion en gps (vaidar cordenadas).

Deves pedir nombre y numero de telefono obligatorio.

Si es de provincia no pedir direccion detallada enves de eso preguntar por que linia de transporte le gustaria que se lo mandemos en cuanto confirme pasar a (CONFIRMACION)

No repetir datos ya enviados.

---

# 📦 **CONFIRMACIÓN**

Se confirma solo si hay dirección completa o coordenadas válidas.

El pago se coordina directo con asesor que se va a comunicar.

Mensaje obligatorio:

\`\`\`
¡Gracias por tu confianza, ${nameToUse}! 🚚💚

Recibí tu dirección:

📍 [dirección o coordenadas]

Entrega estimada: dentro las primeras 8–24 horas despues del pedido.

Un encargado te llamará para coordinar ⭐
\`\`\`

---

# 📝 **REPORTE (solo si hubo confirmación)**

\`\`\`
"Hola *${bot.name}*, nuevo pedido de ${nameToUse}.
Contacto: ${(userPhone || '').replace(/^\+/, '')} (Solo el numero de tefono sin textos).
Dirección: [dirección o coordenadas].
Descripción: [producto]."
\`\`\`

Si no hubo confirmación → \`"reporte": ""\`.

---

# 🚨 REGLA OBLIGATORIA (NO NEGOCIABLE)

Está prohibido inventar datos.
Toda la información debe obtenerse únicamente de la base de conocimiento del producto.

---

# 🧩 REGLAS GENERALES

- Tono cálido, cercano, empático y natural con acento boliviano.
- No repetir fotos ni URLs de testimonios ya enviados.
- No dar precios en los primeros mensajes.
- En dudas → usar testimonios.
- No pedir datos ya recibidos.
- No ofrecer productos ya cerrados.
- Usar *negritas con un asterisco por lado*.
- Mensajes cortos y directos (excepto el primer mensaje del producto).
- 2 saltos de línea entre bloques de texto.
- Responder siempre aunque el input llegue vacío: usar el historial.
- Mensajes cortos, claros y humanos.

---

# 🔥 GATILLOS MENTALES (VENTA ÉTICA)

- Urgencia, escasez, autoridad, prueba social, transformación.
- Insistir de forma estratégica, amigable y respetuosa.
- Objetivo principal: cerrar la venta.
- Después de la confirmación → NO seguir vendiendo.

---

# 📏 REGLAS DE MENSAJES

## mensaje1

- Si es el primer mensaje del producto: enviar el texto completo tal cual.
- Si no: ${maxM1 ? `máx. ${maxM1} caracteres.` : 'corto y directo.'} Con emojis. Sin preguntas. 2 saltos entre frases.

## mensaje2 (opcional)

- ${maxM2 ? `Máx. ${maxM2} caracteres.` : 'Corto y directo.'} Pregunta suave o llamada a la acción.

## mensaje3 (opcional)

- ${maxM3 ? `Máx. ${maxM3} caracteres.` : 'Corto y directo.'} Emoción, gatillo o pregunta de cierre.

Usar solo 1 o 2 mensajes por turno.
Usar mensaje2 y mensaje3 SOLO si realmente aportan valor.

## Regla estricta

- Jamás superar el límite de caracteres por mensaje.
- Resaltar palabras clave con *negrita de un asterisco*.
- Separar bloques con 2 saltos de línea.

---

# 🧠 REGLA FINAL

Siempre generar una respuesta aunque no llegue texto nuevo.
Leer el historial completo y responder con coherencia y continuidad.

---

# 🧩 BASE DE CONOCIMIENTO (CATÁLOGO)

${productBlock}
${sentUrlsBlock}

---

# 📦 FORMATO DE SALIDA (OBLIGATORIO)

Regla de mensajes:
- mensaje1: SIEMPRE requerido.
- mensaje2: solo si aporta valor real. Si no, dejar "".
- mensaje3: raramente usado. Solo si es imprescindible. Si no, dejar "".
- En la mayoría de turnos solo se necesita mensaje1.

\`\`\`json
{
  "mensaje1": "Texto principal del turno",
  "mensaje2": "",
  "mensaje3": "",
  "fotos_mensaje1": [],
  "videos_mensaje1": [],
  "reporte": ""
}
\`\`\`
`.trim()
}

// ─── Combinar mensajes del buffer ─────────────────────────────────────────────

interface BufferedMsg {
  id: string
  type: string
  content: string
  createdAt: Date
}

function combineBufferedMessages(messages: BufferedMsg[]): string {
  const sorted = [...messages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

  return sorted
    .map(m => {
      switch (m.type) {
        case 'audio': return `🎙️ (audio transcrito): ${m.content} `
        case 'image': return `📷 (imagen analizada): ${m.content} `
        case 'location': return `📍 (ubicación): ${m.content}`
        default: return `📝 (texto): ${m.content}`
      }
    })
    .join('\n')
}

// ─── Character limit enforcer ─────────────────────────────────────────────────

/**
 * Trunca en código los mensajes de la respuesta según los límites configurados en el panel.
 * isFirstInteraction=true → mensaje1 NO se trunca (primer mensaje del producto va completo).
 */
export function enforceCharLimits(
  response: { mensaje1?: string; mensaje2?: string; mensaje3?: string },
  bot: { maxCharsMensaje1: number | null; maxCharsMensaje2: number | null; maxCharsMensaje3: number | null },
  isFirstInteraction: boolean,
): void {
  const m1 = bot.maxCharsMensaje1 && bot.maxCharsMensaje1 > 0 ? bot.maxCharsMensaje1 : null
  const m2 = bot.maxCharsMensaje2 && bot.maxCharsMensaje2 > 0 ? bot.maxCharsMensaje2 : null
  const m3 = bot.maxCharsMensaje3 && bot.maxCharsMensaje3 > 0 ? bot.maxCharsMensaje3 : null

  if (m1 && response.mensaje1 && response.mensaje1.length > m1) {
    response.mensaje1 = response.mensaje1.slice(0, m1)
  }
  if (m2 && response.mensaje2 && response.mensaje2.length > m2) {
    response.mensaje2 = response.mensaje2.slice(0, m2)
  }
  if (m3 && response.mensaje3 && response.mensaje3.length > m3) {
    response.mensaje3 = response.mensaje3.slice(0, m3)
  }
}

// ─── Smart product detector ───────────────────────────────────────────────────

/**
 * Scans recent message history to detect which product the client is discussing.
 * Returns the product id only when exactly one product name matches (conservative).
 * On any ambiguity or no match → returns undefined → full catalog is used (safe fallback).
 */
export function detectIdentifiedProduct(
  recentMessages: Array<{ role: string; content: string }>,
  products: Array<Record<string, unknown>>,
): string[] {
  if (!products.length) return []

  const combinedText = recentMessages
    .map(m => {
      if (m.role === 'assistant') {
        try {
          const parsed = JSON.parse(m.content) as Record<string, unknown>
          return [parsed.mensaje1, parsed.mensaje2, parsed.mensaje3].filter(Boolean).join(' ')
        } catch { return m.content }
      }
      return m.content
    })
    .join(' ')
    .toLowerCase()

  return products
    .filter(p => {
      const name = (p.name as string | undefined)?.trim().toLowerCase()
      return name && name.length > 2 && combinedText.includes(name)
    })
    .map(p => p.id as string)
}

// ─── Main engine ─────────────────────────────────────────────────────────────

export class BotEngine {
  static async handleWebhook(botId: string, payload: Record<string, unknown>): Promise<void> {

    // 1. Cargar bot con credenciales y dueño
    const bot = await prisma.bot.findUnique({
      where: { id: botId },
      include: { secret: true, user: { select: { id: true } } },
    })

    if (!bot || bot.status !== 'ACTIVE' || !bot.secret) {
      console.warn(`[BOT] Bot ${botId} no activo o sin credenciales`)
      return
    }

    // 2. Normalizar payload de YCloud
    const norm = normalizePayload(payload)
    if (!norm) {
      console.warn(`[BOT] No se pudo normalizar payload para bot ${botId} `)
      return
    }

    const { msgId, userPhone, userName, type } = norm

    // 🔍 Debug: loguear nombre del cliente recibido desde webhook
    console.log(`[BOT] Mensaje de ${userPhone} | Nombre recibido: "${userName || '(sin nombre)'}" | Tipo: ${type}`)

    // 3. Deduplicación por messageId de YCloud
    if (msgId) {
      const exists = await prisma.message.findUnique({ where: { messageId: msgId } })
      if (exists) {
        console.log(`[BOT] Mensaje duplicado ${msgId}, omitiendo`)
        return
      }
    }

    if (!bot.secret.ycloudApiKeyEnc) {
      console.warn(`[BOT] Bot ${bot.id} sin API key de YCloud configurada`)
      return
    }
    const apiKey = decrypt(bot.secret.ycloudApiKeyEnc)
    const resolvedKey = await resolveOpenAIKey(botId)
    if (!resolvedKey) {
      console.warn(`[BOT] Bot ${botId} sin API key de OpenAI (sin key propia ni saldo global)`)
      return
    }
    const openaiKey = resolvedKey.key
    const from = bot.secret.whatsappInstanceNumber
    const reportPhone = bot.secret.reportPhone

    // Normalizar teléfono: YCloud espera E.164 sin '+' (ej: "59172794224" no "+59172794224")
    const toPhone = userPhone.replace(/^\+/, '').replace(/\s/g, '')

    // ─── Verificar si el usuario ya compró ───────────────────────────────────
    const existingConv = await prisma.conversation.findUnique({
      where: { botId_userPhone: { botId, userPhone } },
      select: { sold: true, botDisabled: true },
    })
    if (existingConv?.sold) {
      // Ya compró: NO marcar como leído (el vendedor verá el icono de mensaje)
      console.log(`[BOT] Usuario ${userPhone} ya compró, ignorando mensaje`)
      return
    }
    if (existingConv?.botDisabled) {
      // Bot desactivado para este chat por el usuario
      console.log(`[BOT] Bot desactivado para ${userPhone}, ignorando mensaje`)
      return
    }

    // 4. Marcar como leído (solo si no ha comprado)
    if (msgId) markAsRead(msgId, apiKey).catch(() => { })

    // 5. Procesar tipo de mensaje → transcribir audio / analizar imagen
    //    Se hace ANTES del buffer para que el contenido esté listo al guardarse
    let userText = ''
    let resolvedType: 'text' | 'audio' | 'image' | 'location' = 'text'

    try {
      if (type === 'text') {
        userText = norm.text || ''
        resolvedType = 'text'
      } else if (type === 'audio') {
        resolvedType = 'audio'
        userText = norm.audioUrl
          ? await transcribeAudio(norm.audioUrl, openaiKey)
          : '[Audio recibido – sin URL]'
      } else if (type === 'image') {
        resolvedType = 'image'
        userText = norm.imageUrl
          ? `[Imagen enviada] ${await analyzeImage(norm.imageUrl, openaiKey)} `
          : '[Imagen recibida – sin URL]'
      } else if (type === 'location') {
        resolvedType = 'location'
        const lat = norm.locationLat
        const lon = norm.locationLon
        const desc = norm.text ? `${norm.text} ` : ''
        userText = `📍 Ubicación recibida: ${desc}`.trim()
        if (lat && lon) userText += ` | https://maps.google.com/?q=${lat},${lon}`
      }
    } catch (err) {
      console.error(`[BOT] Error procesando media:`, err)
      userText = '[Error procesando media]'
    }

    if (!userText.trim()) {
      console.warn(`[BOT] Texto vacío después de procesar mensaje para bot ${botId}`)
      return
    }

    // 6. Buscar o crear conversación y resetear seguimientos (el usuario respondió)
    // Actualizamos updatedAt para que el buffer de 15s sepa que llegó un nuevo mensaje
    let conversation = await prisma.conversation.upsert({
      where: { botId_userPhone: { botId, userPhone } },
      update: {
        userName: norm.userName || undefined,
        updatedAt: new Date(), // Disparar el buffer
        followUp1At: null,
        followUp1Sent: false,
        followUp2At: null,
        followUp2Sent: false,
      },
      create: {
        botId,
        userPhone,
        userName: norm.userName,
        botState: { create: { welcomeSent: false } },
      },
      include: { botState: true },
    })

    const conversationId = conversation.id
    const welcomeSent = conversation.botState?.welcomeSent ?? false
    const arrivedAt = conversation.updatedAt

    // ✅ CRÍTICO: Si el webhook actual no trae nombre, usar el guardado en BD
    const resolvedUserName = norm.userName || conversation.userName || ''

    // 7. Guardar mensaje en buffer (buffered = true)
    //    El contenido ya está procesado (texto transcrito, imagen descrita)
    await prisma.message.create({
      data: {
        conversationId,
        role: 'user',
        type: resolvedType,
        content: userText,
        buffered: true,
        messageId: msgId || undefined,
      },
    })

    console.log(`[BOT] Buffer: mensaje guardado (${resolvedType}) para ${userPhone}, esperando ${BUFFER_DELAY_MS / 1000}s...`)

    // ─── Buffer: esperar 15 segundos ─────────────────────────────────────────
    // Si llega otro mensaje durante ese tiempo, conversation.updatedAt cambia.
    // Comparamos con arrivedAt: si cambió, este mensaje pertenece a un batch
    // que será procesado por el último en llegar (el "ganador").
    await sleep(BUFFER_DELAY_MS)

    const freshConv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { updatedAt: true },
    })

    if (freshConv && freshConv.updatedAt > arrivedAt) {
      // Hay un mensaje más reciente → ese será el ganador del buffer
      console.log(`[BOT] Buffer: mensaje de ${userPhone} cedido al más reciente`)
      return
    }
    // ─────────────────────────────────────────────────────────────────────────
    // A partir de aquí: SOMOS EL GANADOR del buffer

    // 8. Cargar todos los mensajes pendientes del buffer (buffered = true)
    const bufferedMsgs = await prisma.message.findMany({
      where: { conversationId, role: 'user', buffered: true },
      orderBy: { createdAt: 'asc' },
    })

    if (bufferedMsgs.length === 0) {
      console.warn(`[BOT] No hay mensajes en buffer para procesar (${userPhone})`)
      return
    }

    console.log(`[BOT] Buffer: procesando ${bufferedMsgs.length} mensaje(s) combinados para ${userPhone}`)

    // 9. Combinar todos los mensajes del buffer en un solo contexto
    const combinedUserText = combineBufferedMessages(bufferedMsgs)

    // 10. Eliminar mensajes del buffer y guardar el mensaje combinado en una transacción
    //     Esto asegura que no perdamos los mensajes si algo falla en medio del proceso.
    await prisma.$transaction([
      prisma.message.deleteMany({
        where: { conversationId, role: 'user', buffered: true },
      }),
      prisma.message.create({
        data: {
          conversationId,
          role: 'user',
          type: 'text',
          content: combinedUserText,
          buffered: false,
        },
      }),
    ])

    // 12. Cargar historial reciente (los últimos N mensajes, orden cronológico)
    // Se ordena DESC para tomar los más recientes, luego se invierte para el prompt.
    const recentMessages = await prisma.message.findMany({
      where: { conversationId, buffered: false },
      orderBy: { createdAt: 'desc' },
      take: MAX_HISTORY_MESSAGES,
    })
    recentMessages.reverse() // volver a cronológico (asc) para OpenAI

    const chatHistory: ChatMessage[] = recentMessages.map(m => {
      if (m.role === 'assistant') {
        // Extraer texto legible del JSON del asistente para que el historial sea natural
        try {
          const parsed = JSON.parse(m.content) as Record<string, unknown>
          const parts = [
            parsed.mensaje1,
            parsed.mensaje2,
            parsed.mensaje3,
          ].filter(Boolean).join('\n')
          return { role: 'assistant' as const, content: parts || m.content }
        } catch {
          return { role: 'assistant' as const, content: m.content }
        }
      }
      return { role: m.role as 'user', content: m.content }
    })

    // 13. Cargar productos activos del bot
    const products = await prisma.product.findMany({
      where: { bots: { some: { botId } }, active: true },
    })

    // 13b. Detectar productos mencionados (ahorra tokens — fallback seguro a catálogo completo)
    const identifiedProductIds = detectIdentifiedProduct(recentMessages, products as Array<Record<string, unknown>>)
    if (identifiedProductIds.length) {
      const names = identifiedProductIds.map(id => products.find(p => p.id === id)?.name).join(', ')
      console.log(`[BOT] Smart filter: productos="${names}" — otros en modo minimal`)
    }

    // 13c. Extraer URLs ya enviadas — escanea TODOS los mensajes del asistente, no solo los últimos 6
    // Así aunque la URL se haya enviado hace 20 mensajes, no se repite
    const allAssistantMessages = await prisma.message.findMany({
      where: { conversationId, role: 'assistant', buffered: false },
      select: { content: true, role: true },
      orderBy: { createdAt: 'asc' },
    })
    const sentUrls = extractSentUrls(allAssistantMessages)
    if (sentUrls.length) {
      console.log(`[BOT] URLs ya enviadas (${sentUrls.length}) extraídas de ${allAssistantMessages.length} msgs del asistente`)
    }

    // 14. Construir system prompt y llamar a OpenAI
    const systemPrompt = buildSystemPrompt(
      bot,
      products as Array<Record<string, unknown>>,
      resolvedUserName,
      userPhone,
      identifiedProductIds,
      sentUrls,
      welcomeSent,
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let response: BotJsonResponse
    try {
      const aiModel = (bot as any).aiModel || 'gpt-4o'
      const aiResult = await chatWithUsage(systemPrompt, chatHistory, openaiKey, aiModel)
      response = aiResult.response
      if (resolvedKey.isGlobal) {
        logAiUsage({ userId: resolvedKey.userId, service: 'bot-engine', model: aiModel, promptTokens: aiResult.promptTokens, completionTokens: aiResult.completionTokens }).catch(() => {})
      }
    } catch (aiErr: any) {
      console.error(`[BOT] OpenAI error para ${userPhone}:`, aiErr.message)
      const isQuotaError = aiErr.message?.includes('insufficient_quota') || aiErr.message?.includes('429')
      if (isQuotaError) {
        // Sin saldo → pausar bot automáticamente (igual que si el dueño lo desactiva)
        await prisma.bot.update({ where: { id: botId }, data: { status: 'PAUSED' } }).catch(() => {})
        createNotification(
          bot.user.id,
          '⚠️ Bot pausado — Sin saldo en OpenAI',
          `El bot "${bot.name}" fue pausado automáticamente porque tu API key de OpenAI no tiene saldo. Recarga créditos y reactívalo manualmente.`,
          '/dashboard/services/whatsapp',
        ).catch(() => {})
        console.warn(`[BOT] Bot ${botId} PAUSADO automáticamente por quota insuficiente en OpenAI`)
      } else {
        // Otro error transitorio → respaldo para no dejar al usuario en visto
        await sendText(from, toPhone, '¡Hola! Recibí tu mensaje, en un momento te atiendo 😊', apiKey).catch(() => {})
      }
      return
    }

    // 15. Aplicar límites de caracteres en código (por si la IA los ignora)
    enforceCharLimits(response, bot, !welcomeSent)

    // 15b. Filtro de seguridad: eliminar URLs repetidas aunque la IA las incluyera
    if (sentUrls.length) {
      const sentSet = new Set(sentUrls)
      response.fotos_mensaje1 = (response.fotos_mensaje1 ?? []).filter((u: string) => !sentSet.has(u))
      response.videos_mensaje1 = (response.videos_mensaje1 ?? []).filter((u: string) => !sentSet.has(u))
    }

    // 16. Enviar respuestas vía YCloud
    console.log(`[BOT] Enviando respuesta → from=${from} to=${toPhone}`)
    console.log(`[BOT] mensaje1: ${response.mensaje1?.slice(0, 60)}`)

    if (response.mensaje1) {
      await sendText(from, toPhone, response.mensaje1, apiKey).catch(e =>
        console.error('[BOT] sendText m1 ERROR:', e.message),
      )
      await sleep(Math.floor(Math.random() * 1000) + 1000) // Retardo humano 1-2s
    }

    for (const photoUrl of response.fotos_mensaje1) {
      if (photoUrl.startsWith('https://')) {
        await sendImage(from, toPhone, photoUrl, apiKey).catch(e =>
          console.error('[BOT] sendImage ERROR:', e.message),
        )
        await sleep(800)
      }
    }

    // Enviar videos si GPT los indica
    const videosToSend: string[] = Array.isArray(response.videos_mensaje1)
      ? (response.videos_mensaje1 as unknown[]).filter((v): v is string => typeof v === 'string' && v.startsWith('https://'))
      : []
    for (const videoUrl of videosToSend) {
      await sendVideo(from, toPhone, videoUrl, '', apiKey).catch(e =>
        console.error('[BOT] sendVideo ERROR:', e.message),
      )
      await sleep(1200)
    }

    if (response.mensaje2) {
      await sendText(from, toPhone, response.mensaje2, apiKey).catch(e =>
        console.error('[BOT] sendText m2 ERROR:', e.message),
      )
      await sleep(Math.floor(Math.random() * 1000) + 1000) // Retardo humano 1-2s
    }

    if (response.mensaje3) {
      await sendText(from, toPhone, response.mensaje3, apiKey).catch(e =>
        console.error('[BOT] sendText m3 ERROR:', e.message),
      )
    }

    if (response.reporte && reportPhone) {
      await sendText(from, reportPhone.replace(/^\+/, ''), response.reporte, apiKey).catch(e =>
        console.error('[BOT] sendReport ERROR:', e.message),
      )

      // Marcar como sold para que el bot no siga respondiendo
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { sold: true, soldAt: new Date() }
      }).catch(() => { })

      // Notificación push + campana al dueño del bot
      createNotification(
        bot.user.id,
        `🤖 Nueva venta — ${bot.name}`,
        response.reporte.slice(0, 120),
        '/dashboard/services/whatsapp',
      ).catch(() => {})

      console.log(`[BOT] Conversación ${conversationId} finalizada (Reporte generado para ${userPhone})`)
    } else {
      // Si NO es sold, programar seguimientos automáticos
      const now = new Date()
      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          followUp1At: new Date(now.getTime() + (bot.followUp1Delay || 15) * 60 * 1000),
          followUp1Sent: false,
          followUp2At: new Date(now.getTime() + (bot.followUp2Delay || 4320) * 60 * 1000),
          followUp2Sent: false,
        },
      }).catch(() => { })
      console.log(`[BOT] Seguimientos programados: ${bot.followUp1Delay}m y ${bot.followUp2Delay}m`)
    }

    // 16. Guardar respuesta del asistente
    await prisma.message.create({
      data: {
        conversationId,
        role: 'assistant',
        type: 'text',
        content: JSON.stringify(response),
        buffered: false,
      },
    })

    // 17. Actualizar estado del bot (solo botState, NO conversation.updatedAt)
    // IMPORTANTE: no actualizar conversation.updatedAt aquí porque interferiría
    // con el buffer de mensajes que llegan mientras el winner está procesando.
    const stateUpdates: Record<string, unknown> = {}
    // Solo marcar welcomeSent=true cuando el producto ya estaba identificado
    // Si el bot aún no sabe qué producto es (solo dijo "hola"), NO marcar como enviado
    if (!welcomeSent && response.mensaje1 && identifiedProductIds.length > 0) {
      stateUpdates.welcomeSent = true
      stateUpdates.welcomeSentAt = new Date()
    }
    if (response.reporte) {
      stateUpdates.lastIntent = 'confirmation'
    }

    if (Object.keys(stateUpdates).length > 0) {
      await prisma.botState.upsert({
        where: { conversationId },
        create: { conversationId, ...stateUpdates },
        update: stateUpdates,
      }).catch(() => {})
    }

    console.log(`[BOT] ✓ Respuesta enviada para bot=${botId} phone=${userPhone} (${bufferedMsgs.length} msgs procesados)`)
  }
}
