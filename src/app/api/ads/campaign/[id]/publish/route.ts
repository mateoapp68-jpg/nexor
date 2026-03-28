export const dynamic = 'force-dynamic'
export const maxDuration = 120 // 2 minutes — needed for video upload + Meta processing wait
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/ads/encryption'
import { AdapterFactory } from '@/lib/ads/factory'
import { supabaseAdmin } from '@/lib/supabase'
import { generateAudienceInterests } from '@/lib/ads/openai-ads'
import { MetaAdapter } from '@/lib/ads/adapters/meta'

const BUCKET = 'ad-creatives'

export async function POST(_req: Request, { params }: { params: { id: string } }) {
    const ENC_KEY = process.env.ADS_ENCRYPTION_KEY
    if (!ENC_KEY) return NextResponse.json({ error: 'Configuración del servidor incompleta (ADS_ENCRYPTION_KEY)' }, { status: 500 })

    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const campaign = await (prisma as any).adCampaignV2.findFirst({
        where: { id: params.id, userId: user.id },
        include: {
            brief: true,
            strategy: true,
            connectedAccount: {
                include: { integration: { include: { token: true } } }
            },
            creatives: { orderBy: { slotIndex: 'asc' } }
        }
    })

    if (!campaign) return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 })
    if (campaign.status === 'PUBLISHED') {
        return NextResponse.json({ error: 'Esta campaña ya fue publicada' }, { status: 400 })
    }
    if (campaign.status === 'PUBLISHING') {
        return NextResponse.json({ error: 'Esta campaña ya está siendo publicada. Espera unos segundos e intenta de nuevo.' }, { status: 400 })
    }
    if (!campaign.connectedAccount) {
        return NextResponse.json({ error: 'Selecciona una cuenta publicitaria primero' }, { status: 400 })
    }
    if (!campaign.connectedAccount.integration?.token) {
        return NextResponse.json({ error: 'Reconecta tu cuenta de Meta desde Integraciones' }, { status: 400 })
    }

    // Validate required fields per destination
    const dest = campaign.strategy.destination
    // All Meta campaigns require a Facebook page to create ad creatives
    if (campaign.platform === 'META' && !campaign.pageId) {
        return NextResponse.json({ error: 'Selecciona una Página de Facebook. Es obligatoria para todos los anuncios de Meta.' }, { status: 400 })
    }
    if (dest === 'whatsapp' && !campaign.whatsappNumber) {
        return NextResponse.json({ error: 'Selecciona un número de WhatsApp Business para esta campaña' }, { status: 400 })
    }
    if (['website'].includes(dest) && !campaign.destinationUrl) {
        return NextResponse.json({ error: 'Ingresa la URL de destino para esta campaña' }, { status: 400 })
    }
    if (!campaign.dailyBudgetUSD || campaign.dailyBudgetUSD <= 0) {
        return NextResponse.json({ error: 'El presupuesto diario debe ser mayor a 0' }, { status: 400 })
    }
    // Require at least one creative with primary text
    const validCreatives = campaign.creatives.filter((c: any) => c.primaryText?.trim())
    if (validCreatives.length === 0) {
        return NextResponse.json({ error: 'Genera los textos del anuncio antes de publicar' }, { status: 400 })
    }
    // Require at least one creative with a valid media URL (image or video)
    const isValidUrl = (url: string | null) => typeof url === 'string' && url.startsWith('http')
    const hasMedia = campaign.creatives.some((c: any) => isValidUrl(c.mediaUrl))
    if (!hasMedia) {
        return NextResponse.json({ error: 'Agrega al menos una imagen o video al anuncio antes de publicar' }, { status: 400 })
    }

    // Mark as publishing — all validations above must pass before this point
    await (prisma as any).adCampaignV2.update({
        where: { id: params.id },
        data: { status: 'PUBLISHING' }
    })

    try {
        const adapter = AdapterFactory.getAdapter(campaign.platform)

        let accessToken: string
        try {
            accessToken = decrypt(campaign.connectedAccount.integration.token.accessTokenEncrypted, ENC_KEY!)
        } catch {
            throw new Error('No se pudo leer el token de acceso. Reconecta tu cuenta desde Integraciones.')
        }

        // FIX: Map all strategy objectives to correct Meta OUTCOME_* values
        const objectiveMap: Record<string, string> = {
            conversions: 'OUTCOME_SALES',
            leads: 'OUTCOME_LEADS',
            traffic: 'OUTCOME_TRAFFIC',
            awareness: 'OUTCOME_AWARENESS',
            engagement: 'OUTCOME_ENGAGEMENT',
            app_promotion: 'OUTCOME_APP_PROMOTION'
        }
        const metaObjective = objectiveMap[(campaign.strategy.objective || '').toLowerCase()] || 'OUTCOME_TRAFFIC'

        // Parse locations: "CO" → country, "city:KEY:Name" → city
        const countries: string[] = []
        const cities: { key: string; radius: number; distance_unit: string }[] = []
        for (const loc of campaign.locations as string[]) {
            if (loc.startsWith('city:')) {
                const parts = loc.split(':')
                const key = parts[1]
                if (key) cities.push({ key, radius: 25, distance_unit: 'kilometer' })
            } else if (loc.startsWith('cc:')) {
                // Format: "cc:CO:Bogotá" — extract country code
                const parts = loc.split(':')
                const countryCode = parts[1]
                if (countryCode?.length === 2 && !countries.includes(countryCode.toUpperCase())) {
                    countries.push(countryCode.toUpperCase())
                }
            } else if (loc.length === 2) {
                countries.push(loc.toUpperCase())
            }
        }
        const geoLocations = (countries.length > 0 || cities.length > 0)
            ? {
                ...(countries.length > 0 ? { countries } : {}),
                ...(cities.length > 0 ? { cities } : {})
            }
            : undefined

        // FIX: pass all creative copies so the adapter creates one ad per variation
        // Only include mediaUrl if it's a real HTTP URL (never blob:// or null)
        const creativeCopies = campaign.creatives
            .filter((c: any) => c.primaryText)
            .map((c: any) => ({
                primaryText: c.primaryText || '',
                headline: c.headline || '',
                description: c.description || '',
                imageUrl: isValidUrl(c.mediaUrl) ? c.mediaUrl : undefined
            }))

        const messengerDestination = dest === 'whatsapp'
            ? 'WHATSAPP' as const
            : dest === 'messenger'
                ? 'MESSENGER' as const
                : dest === 'instagram'
                    ? 'INSTAGRAM' as const
                    : undefined

        // ── AI Audience Segmentation (Meta only) ──────────────────────────────
        // Generate interest keywords from the brief with OpenAI, then resolve
        // each keyword to a real Meta interest ID via the Targeting Search API.
        let audienceInterests: Array<{ id: string; name: string }> = []
        if (campaign.platform === 'META') {
            try {
                const oaiConfig = await (prisma as any).openAIConfig.findUnique({ where: { userId: user.id } })
                if (oaiConfig?.isValid && oaiConfig.apiKeyEnc) {
                    const oaiKey = decrypt(oaiConfig.apiKeyEnc, ENC_KEY!)
                    const keywords = await generateAudienceInterests(campaign.brief, oaiKey, oaiConfig.model || 'gpt-5.1')
                    console.log(`[Publish] AI generated ${keywords.length} interest keywords:`, keywords.join(', '))

                    const metaAdapter = adapter as MetaAdapter
                    const resolvedAll = await Promise.allSettled(
                        keywords.map(kw => metaAdapter.searchTargetingInterests(accessToken, kw))
                    )
                    // Flatten fulfilled results only, deduplicate by id, cap at 10
                    const seen = new Set<string>()
                    for (const result of resolvedAll) {
                        if (result.status !== 'fulfilled') continue
                        for (const interest of result.value) {
                            if (!seen.has(interest.id)) {
                                seen.add(interest.id)
                                audienceInterests.push(interest)
                            }
                        }
                    }
                    audienceInterests = audienceInterests.slice(0, 10)
                    console.log(`[Publish] Resolved ${audienceInterests.length} Meta interests:`, audienceInterests.map(i => i.name).join(', '))
                    if (audienceInterests.length === 0) {
                        console.warn('[Publish] No audience interests found — publishing without interest targeting')
                    }
                }
            } catch (e: any) {
                // Non-blocking: if AI interest generation fails, publish without targeting
                console.error('[Publish] Audience interest generation failed (non-blocking):', e)
            }
        }

        const result = await adapter.publishFromDraft(
            accessToken,
            campaign.connectedAccount.providerAccountId,
            {
                name: campaign.name,
                objective: metaObjective,
                budgetType: 'DAILY',
                budgetAmount: campaign.dailyBudgetUSD,
                geoLocations,
                // Fallback single-copy fields (used if copies array is empty)
                primaryText: campaign.creatives[0]?.primaryText || campaign.brief.description,
                headline: campaign.creatives[0]?.headline || campaign.brief.name,
                description: campaign.creatives[0]?.description || campaign.brief.valueProposition,
                cta: campaign.brief.mainCTA === 'Comprar ahora' ? 'SHOP_NOW' : 'LEARN_MORE',
                providerPageId: campaign.pageId || undefined,
                providerWhatsAppNumber: campaign.whatsappNumber || undefined,
                welcomeMessage: campaign.welcomeMessage || undefined,
                pixelId: campaign.pixelId || undefined,
                destinationUrl: campaign.destinationUrl || undefined,
                messengerDestination,
                // Multi-copy: creates one ad per variation
                copies: creativeCopies.length > 0 ? creativeCopies : undefined,
                assets: campaign.creatives
                    .filter((c: any) => isValidUrl(c.mediaUrl))
                    .map((c: any) => ({
                        type: (c.mediaType?.toUpperCase() || 'IMAGE') as 'IMAGE' | 'VIDEO',
                        storageUrl: c.mediaUrl!
                    })),
                // AI audience interests (Meta only — resolved from brief via OpenAI + Meta Targeting Search)
                ...(audienceInterests.length > 0 ? { audienceInterests } : {}),
                advantageType: campaign.strategy.advantageType
            } as any
        )

        await (prisma as any).adCampaignV2.update({
            where: { id: params.id },
            data: {
                status: 'PUBLISHED',
                providerCampaignId: result.providerCampaignId,
                providerGroupId: result.providerGroupId || null,
                providerAdId: result.providerAdId || null,
                publishedAt: new Date()
            }
        })

        // Delete uploaded media from Supabase Storage after successful publish
        const storageUrlMarker = `/object/public/${BUCKET}/`
        const storagePaths = campaign.creatives
            .filter((c: any) => c.mediaUrl?.includes(storageUrlMarker))
            .map((c: any) => {
                const idx = c.mediaUrl.indexOf(storageUrlMarker)
                // Strip query params (e.g. ?t=123) so path is clean
                const rawPath = c.mediaUrl.slice(idx + storageUrlMarker.length)
                return rawPath.split('?')[0]
            })
            .filter(Boolean)

        if (storagePaths.length > 0) {
            try {
                const { error: removeErr } = await supabaseAdmin.storage.from(BUCKET).remove(storagePaths)
                if (removeErr) console.warn('[PublishCampaign] Storage remove partial error:', removeErr.message)
                else console.log(`[PublishCampaign] Deleted ${storagePaths.length} file(s) from storage`)
                await (prisma as any).adCreative.updateMany({
                    where: { campaignId: params.id },
                    data: { mediaUrl: null }
                })
            } catch (e) {
                console.warn('[PublishCampaign] Storage cleanup failed (non-fatal):', e)
            }
        }

        return NextResponse.json({ success: true, result })
    } catch (err: any) {
        console.error('[PublishCampaign]', err)

        // Make Meta errors more actionable
        let userMessage = err.message || 'Error al publicar la campaña'
        const msg = userMessage.toLowerCase()
        if (msg.includes('whatsapp') && msg.includes('personal')) {
            userMessage = 'Tu página tiene un WhatsApp personal vinculado. Para anuncios de WhatsApp necesitas una cuenta de WhatsApp Business. Ve a Configuración de la Página → WhatsApp y vincula tu número de WhatsApp Business.'
        } else if (msg.includes('whatsapp') && msg.includes('business')) {
            userMessage = 'Conecta una cuenta de WhatsApp Business a tu Página de Facebook antes de publicar este anuncio. Ve a Configuración de la Página → WhatsApp.'
        } else if (msg.includes('método de pago') || msg.includes('payment')) {
            userMessage = 'Tu cuenta publicitaria no tiene un método de pago válido. Agrega un método de pago en el Administrador de Anuncios de Meta.'
        } else if (msg.includes('permiso') || msg.includes('permission') || msg.includes('autorización')) {
            userMessage = 'Sin permisos suficientes. Reconecta tu cuenta de Meta desde la sección de Integraciones.'
        }

        await (prisma as any).adCampaignV2.update({
            where: { id: params.id },
            data: {
                status: 'FAILED',
                failureReason: userMessage
            }
        })

        return NextResponse.json({ error: userMessage }, { status: 500 })
    }
}
