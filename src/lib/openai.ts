/**
 * OpenAI integration – uses native fetch (Node 18+).
 * No openai SDK dependency required.
 */

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface BotJsonResponse {
  mensaje1: string
  mensaje2: string
  mensaje3: string
  fotos_mensaje1: string[]
  videos_mensaje1: string[]
  audio_url: string        // URL de audio PTT (nota de voz) — solo Baileys
  reporte: string
}

// ─── Audio Transcription (Whisper) ───────────────────────────────────────────

export async function transcribeAudio(audioSource: string | Blob, apiKey: string): Promise<string> {
  let audioBuffer: ArrayBuffer
  let baseMime = 'audio/ogg'

  if (typeof audioSource === 'string') {
    // Caso YCloud: Descargar el archivo desde URL
    const audioRes = await fetch(audioSource)
    if (!audioRes.ok) throw new Error(`Failed to download audio: ${audioRes.status}`)
    audioBuffer = await audioRes.arrayBuffer()
    const rawContentType = audioRes.headers.get('content-type') || 'audio/ogg'
    baseMime = rawContentType.split(';')[0].trim()
  } else {
    // Caso Baileys: Usar el Blob/File directamente
    audioBuffer = await audioSource.arrayBuffer()
    baseMime = audioSource.type.split(';')[0].trim() || 'audio/ogg'
  }

  const mimeToExt: Record<string, string> = {
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/wav': 'wav',
    'audio/webm': 'webm',
    'audio/flac': 'flac',
    'audio/aac': 'm4a',
    'audio/amr': 'amr',
  }
  const ext = mimeToExt[baseMime] ?? 'ogg'

  const blob = new Blob([audioBuffer], { type: baseMime })
  const form = new FormData()
  form.append('file', blob, `audio.${ext}`)
  form.append('model', 'whisper-1')
  form.append('language', 'es')

  const whisperController = new AbortController()
  const whisperTimeout = setTimeout(() => whisperController.abort(), 60000)
  let res: Response
  try {
    res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: whisperController.signal,
    })
  } finally {
    clearTimeout(whisperTimeout)
  }

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Whisper error ${res.status}: ${err}`)
  }

  const data = await res.json()
  return (data.text as string) || ''
}

// ─── Image Analysis (GPT-4o Vision) ──────────────────────────────────────────

export async function analyzeImage(imageUrl: string, apiKey: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analiza esta imagen de forma completa y universal. Tu tarea:

1. Detecta claramente qué aparece en la imagen.
2. Describe objetos, personas, texto visible, colores y contexto general.
3. Identifica posibles usos, problemas, detalles importantes o elementos relevantes.
4. Explica situaciones, acciones, características visuales y cualquier cosa útil para comprender la imagen.
5. Si contiene texto, transcríbelo con exactitud.
6. Si es una imagen técnica (código, interfaz, error, pantalla), analízala técnicamente y explica qué significa o qué puede estar fallando.
7. Si es un documento (factura, recibo, contrato, formulario), extrae los datos clave.

Reglas:
- Usa lenguaje claro y preciso.
- No inventes nada que no se vea claramente.
- Si falta información, indícalo.
- Analiza la imagen completa, no solo partes.`,
              },
              { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
            ],
          },
        ],
        max_tokens: 800,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Vision error ${res.status}: ${err}`)
    }

    const data = await res.json()
    return (data.choices?.[0]?.message?.content as string) || ''
  } finally {
    clearTimeout(timeout)
  }
}

// ─── Chat Completion (forces JSON output) ────────────────────────────────────

function normalizeFotos(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((u): u is string => typeof u === 'string' && u.trim().startsWith('http'))
  if (typeof raw === 'string' && raw.trim()) {
    return raw
      .split(',')
      .map(s => s.trim())
      .filter(s => s.startsWith('http'))
  }
  return []
}

export const AI_MODELS = [
  { id: 'gpt-5.2',      label: 'GPT-5.2 — Último modelo · Máxima capacidad', badge: '🚀' },
  { id: 'gpt-5.1',      label: 'GPT-5.1 — Más inteligente (recomendado)',     badge: '⚡' },
  { id: 'gpt-4o',       label: 'GPT-4o — Equilibrado',                         badge: '⚖️' },
  { id: 'gpt-4o-mini',  label: 'GPT-4o Mini — Más económico',                 badge: '💰' },
] as const

export type AiModelId = typeof AI_MODELS[number]['id']

export const FOLLOWUP_MODEL = 'gpt-4o-mini' // Siempre económico para seguimientos

interface ChatCompletionResult {
  content: string
  promptTokens: number
  completionTokens: number
}

async function callChatCompletion(
  messages: Array<{ role: string; content: string }>,
  apiKey: string,
  model: string = 'gpt-5.1',
): Promise<ChatCompletionResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60000) // 1 min timeout

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        messages,
        temperature: 0.6,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`OpenAI chat error ${res.status}: ${err}`)
    }

    const data = await res.json()
    return {
      content: (data.choices?.[0]?.message?.content as string) || '{}',
      promptTokens: (data.usage?.prompt_tokens as number) ?? 0,
      completionTokens: (data.usage?.completion_tokens as number) ?? 0,
    }
  } finally {
    clearTimeout(timeout)
  }
}

export interface ChatWithUsageResult {
  response: BotJsonResponse
  promptTokens: number
  completionTokens: number
}

export async function chatWithUsage(
  systemPrompt: string,
  history: ChatMessage[],
  apiKey: string,
  model: string = 'gpt-4o',
): Promise<ChatWithUsageResult> {
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt },
    ...history,
  ]

  let result = await callChatCompletion(messages, apiKey, model)
  let totalPrompt = result.promptTokens
  let totalCompletion = result.completionTokens

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(result.content)
  } catch {
    // Retry once with explicit instruction
    messages.push(
      { role: 'assistant', content: result.content },
      { role: 'user', content: 'El JSON no es válido. Devuelve SOLO JSON con el schema exacto indicado.' },
    )
    result = await callChatCompletion(messages, apiKey, model)
    totalPrompt += result.promptTokens
    totalCompletion += result.completionTokens
    parsed = JSON.parse(result.content) // If this throws again, let it propagate
  }

  return {
    response: {
      mensaje1: typeof parsed.mensaje1 === 'string' ? parsed.mensaje1 : '',
      mensaje2: typeof parsed.mensaje2 === 'string' ? parsed.mensaje2 : '',
      mensaje3: typeof parsed.mensaje3 === 'string' ? parsed.mensaje3 : '',
      fotos_mensaje1: normalizeFotos(parsed.fotos_mensaje1),
      videos_mensaje1: normalizeFotos(parsed.videos_mensaje1),
      audio_url: typeof parsed.audio_url === 'string' ? parsed.audio_url : '',
      reporte: typeof parsed.reporte === 'string' ? parsed.reporte : '',
    },
    promptTokens: totalPrompt,
    completionTokens: totalCompletion,
  }
}

export async function chat(
  systemPrompt: string,
  history: ChatMessage[],
  apiKey: string,
  model: string = 'gpt-4o',
): Promise<BotJsonResponse> {
  const { response } = await chatWithUsage(systemPrompt, history, apiKey, model)
  return response
}
