export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/ads/encryption'
import { generateAdImage, editAdImageWithReference, type ImageQuality, type ImageSize } from '@/lib/ads/openai-ads'
import { supabaseAdmin } from '@/lib/supabase'
import { getUserCredits, getGlobalOpenAIKey, logAiUsage } from '@/lib/ai-credits'

const ENC_KEY = process.env.ADS_ENCRYPTION_KEY || ''
const BUCKET = 'ad-creatives'

const VALID_SIZES: ImageSize[] = ['1024x1024', '1024x1792', '1792x1024']
const VALID_QUALITIES: ImageQuality[] = ['fast', 'standard', 'premium']

// Map DALL-E size → gpt-image-1 size (closest equivalent)
function toEditSize(size: string): '1024x1024' | '1024x1536' | '1536x1024' {
    if (size === '1024x1792') return '1024x1536'
    if (size === '1792x1024') return '1536x1024'
    return '1024x1024'
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const oaiConfig = await (prisma as any).openAIConfig.findUnique({ where: { userId: user.id } })
    let apiKey = ''
    let isGlobalKey = false

    if (oaiConfig?.isValid && oaiConfig.apiKeyEnc) {
        try { apiKey = decrypt(oaiConfig.apiKeyEnc, ENC_KEY) } catch {}
    }

    if (!apiKey) {
        const credits = await getUserCredits(user.id)
        if (credits <= 0) return NextResponse.json({ error: 'Sin saldo de créditos AI. Recarga en tu perfil.' }, { status: 400 })
        apiKey = (await getGlobalOpenAIKey()) ?? ''
        if (!apiKey) return NextResponse.json({ error: 'Configura tu OpenAI API Key primero' }, { status: 400 })
        isGlobalKey = true
    }

    const campaign = await (prisma as any).adCampaignV2.findFirst({
        where: { id: params.id, userId: user.id },
        include: { brief: true, strategy: true }
    })
    if (!campaign) return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 })

    const body = await req.json()
    const {
        slotIndex = 0,
        creativeId,
        customPrompt,
        quality = 'standard',
        size = '1024x1024',
        referenceImageUrl,
    } = body

    const brief = {
        name: campaign.brief.name,
        industry: campaign.brief.industry,
        description: campaign.brief.description,
        valueProposition: campaign.brief.valueProposition,
        painPoints: campaign.brief.painPoints,
        interests: campaign.brief.interests,
        brandVoice: campaign.brief.brandVoice,
        brandColors: campaign.brief.brandColors,
        visualStyle: campaign.brief.visualStyle,
        primaryObjective: campaign.brief.primaryObjective,
        mainCTA: campaign.brief.mainCTA,
        targetLocations: campaign.brief.targetLocations,
        keyMessages: campaign.brief.keyMessages,
        personalityTraits: campaign.brief.personalityTraits,
        contentThemes: campaign.brief.contentThemes,
        engagementLevel: campaign.brief.engagementLevel || 'medio'
    }

    try {
        let imageUrl: string

        if (referenceImageUrl) {
            // Use gpt-image-1 to edit/improve the uploaded image
            const prompt = customPrompt || `Professional advertising photo for ${brief.name}, a ${brief.industry} brand. Enhance the product photo: improve lighting, background, composition, and overall visual quality to match commercial advertising standards. Style: ${(brief.visualStyle as string[]).slice(0, 2).join(', ')}. No text, no watermarks, no logos.`

            const imgBuffer = await editAdImageWithReference({
                imageUrl: referenceImageUrl,
                prompt,
                apiKey,
                size: toEditSize(VALID_SIZES.includes(size as ImageSize) ? size : '1024x1024'),
            })

            // Upload the result to Supabase Storage
            const path = `ads/${user.id}/${params.id}/slot-${slotIndex}-edit-${Date.now()}.png`
            const { error: uploadErr } = await supabaseAdmin.storage
                .from(BUCKET)
                .upload(path, imgBuffer, { contentType: 'image/png', upsert: true })
            if (uploadErr) throw new Error(uploadErr.message)

            const { data: urlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path)
            imageUrl = urlData.publicUrl
        } else {
            // No reference image → use DALL-E 3 to generate from scratch
            const dalleUrl = await generateAdImage({
                brief,
                mediaType: campaign.strategy.mediaType,
                slotIndex,
                apiKey,
                customPrompt: customPrompt || undefined,
                quality: VALID_QUALITIES.includes(quality) ? quality : 'standard',
                size: VALID_SIZES.includes(size) ? size : '1024x1024',
            })

            // DALL-E URLs expire in ~1h — download and upload to Supabase for permanent storage
            const imgRes = await fetch(dalleUrl)
            if (!imgRes.ok) throw new Error('No se pudo descargar la imagen generada por DALL-E')
            const imgBuffer = Buffer.from(await imgRes.arrayBuffer())
            const path = `ads/${user.id}/${params.id}/slot-${slotIndex}-gen-${Date.now()}.png`
            const { error: uploadErr } = await supabaseAdmin.storage
                .from(BUCKET)
                .upload(path, imgBuffer, { contentType: 'image/png', upsert: true })
            if (uploadErr) throw new Error(uploadErr.message)
            const { data: urlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path)
            imageUrl = urlData.publicUrl
        }

        // Persist to DB — update existing or create new
        let savedCreativeId = creativeId
        if (creativeId) {
            await (prisma as any).adCreative.update({
                where: { id: creativeId },
                data: { mediaUrl: imageUrl, mediaType: 'image', aiGenerated: true }
            })
        } else {
            const created = await (prisma as any).adCreative.create({
                data: {
                    campaignId: params.id,
                    slotIndex,
                    mediaUrl: imageUrl,
                    mediaType: 'image',
                    aiGenerated: true,
                    primaryText: '',
                    headline: '',
                    description: '',
                }
            })
            savedCreativeId = created.id
        }

        if (isGlobalKey) logAiUsage({ userId: user.id, service: 'ads-image', model: 'gpt-image-1', promptTokens: 500, completionTokens: 0 }).catch(() => {})
        return NextResponse.json({ imageUrl, creativeId: savedCreativeId })
    } catch (err: any) {
        console.error('[GenerateImage]', err)
        return NextResponse.json({ error: err.message || 'Error al generar la imagen' }, { status: 500 })
    }
}
