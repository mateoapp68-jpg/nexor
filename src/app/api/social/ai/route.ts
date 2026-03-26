export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/ads/encryption'

const ENC_KEY = process.env.ADS_ENCRYPTION_KEY || ''

async function callOpenAI(apiKey: string, model: string, systemPrompt: string, userPrompt: string) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.8
        })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error?.message || 'OpenAI error')
    return data.choices[0].message.content.trim()
}

export async function POST(req: Request) {
    try {
        const user = await getAuthUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { action, content, networks, topic, language = 'es' } = await req.json()

        const oaiConfig = await (prisma as any).openAIConfig.findUnique({ where: { userId: user.id } })
        if (!oaiConfig?.isValid || !oaiConfig.apiKeyEnc) {
            return NextResponse.json({ error: 'Configura tu API Key de OpenAI en Configuración → IA' }, { status: 400 })
        }

        const apiKey = decrypt(oaiConfig.apiKeyEnc, ENC_KEY)
        const model = oaiConfig.model || 'gpt-4o'

        const networkList = (networks || []).join(', ') || 'redes sociales'

        let result: string

        if (action === 'generate') {
            result = await callOpenAI(apiKey, model,
                `Eres un experto en marketing de contenido para ${networkList}. Escribes en ${language === 'es' ? 'español' : language}. Genera posts atractivos, con emojis relevantes, hashtags efectivos y llamados a la acción claros. Para negrita usa caracteres Unicode bold (𝗻𝗲𝗴𝗿𝗶𝘁𝗮) que funcionan en todas las redes.`,
                `Crea un post de marketing para: "${topic}". Redes destino: ${networkList}. El post debe ser convincente, incluir emojis y 3-5 hashtags al final.`
            )
        } else if (action === 'improve') {
            result = await callOpenAI(apiKey, model,
                `Eres un experto en copywriting para redes sociales. Mejoras textos haciéndolos más persuasivos, con mejor estructura, emojis y llamados a la acción. Redes destino: ${networkList}.`,
                `Mejora este texto para publicar en ${networkList}:\n\n${content}`
            )
        } else if (action === 'script') {
            result = await callOpenAI(apiKey, model,
                `Eres un experto en creación de guiones para videos de redes sociales (TikTok, Instagram Reels, YouTube Shorts). Creas guiones detallados con estructura: gancho inicial, desarrollo, llamado a la acción.`,
                `Crea un guión de video para: "${topic}". \nFormato: \n- Duración objetivo: 30-60 segundos\n- Incluye: [GANCHO], [DESARROLLO], [CTA]\n- Incluye indicaciones de tono y gestos donde sea relevante`
            )
        } else if (action === 'analyze') {
            result = await callOpenAI(apiKey, model,
                `Eres un analista de contenido digital experto. Analizas métricas y das recomendaciones específicas y accionables para mejorar el rendimiento del contenido.`,
                `Analiza estas métricas de redes sociales y da 5 recomendaciones concretas para mejorar el contenido:\n\n${content}`
            )
        } else {
            return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
        }

        return NextResponse.json({ result })
    } catch (err: any) {
        console.error('[SocialAI]', err)
        return NextResponse.json({ error: err.message || 'Error de IA' }, { status: 500 })
    }
}
