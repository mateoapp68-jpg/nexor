export const dynamic = 'force-dynamic'
/**
 * GET /api/ads/metrics
 * Returns lifetime insights for all user's published campaigns.
 * Fetches from Meta Graph API for META campaigns.
 * Query param: ?campaignIds=id1,id2,... (optional, filters by campaign DB IDs)
 */
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/ads/encryption'
import { AdPlatform } from '@prisma/client'

const META_API = 'https://graph.facebook.com/v22.0'

interface MetricResult {
    campaignId: string
    impressions: number
    clicks: number
    spend: number
    reach: number
    ctr: number
    cpm: number
    error?: string
}

async function fetchMetaInsights(
    providerCampaignId: string,
    accessToken: string
): Promise<Omit<MetricResult, 'campaignId'>> {
    const fields = 'impressions,clicks,spend,reach'
    const url = `${META_API}/${providerCampaignId}/insights?fields=${fields}&date_preset=last_30d&access_token=${accessToken}`
    const res = await fetch(url)
    const data = await res.json()

    if (!res.ok || data.error) {
        throw new Error(data.error?.message || `Meta API error ${res.status}`)
    }

    const row = data.data?.[0]
    if (!row) {
        return { impressions: 0, clicks: 0, spend: 0, reach: 0, ctr: 0, cpm: 0 }
    }

    const impressions = parseInt(row.impressions || '0')
    const clicks = parseInt(row.clicks || '0')
    const spend = parseFloat(row.spend || '0')
    const reach = parseInt(row.reach || '0')
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0
    const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0

    return { impressions, clicks, spend, reach, ctr, cpm }
}

export async function GET(req: Request) {
    const ENCRYPTION_KEY = process.env.ADS_ENCRYPTION_KEY
    if (!ENCRYPTION_KEY) return NextResponse.json({ error: 'Configuración del servidor incompleta (ADS_ENCRYPTION_KEY)' }, { status: 500 })

    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const campaignIdsParam = searchParams.get('campaignIds')
    const campaignIdFilter = campaignIdsParam ? campaignIdsParam.split(',').filter(Boolean) : null

    // Fetch published campaigns with provider IDs
    const where: any = {
        userId: user.id,
        status: 'PUBLISHED',
        providerCampaignId: { not: null }
    }
    if (campaignIdFilter?.length) {
        where.id = { in: campaignIdFilter }
    }

    const campaigns = await (prisma as any).adCampaignV2.findMany({
        where,
        select: { id: true, platform: true, providerCampaignId: true, connectedAccountId: true }
    })

    if (campaigns.length === 0) {
        return NextResponse.json({ metrics: {} })
    }

    // Group by platform to fetch tokens once per platform
    const metaCampaigns = campaigns.filter((c: any) => c.platform === AdPlatform.META)

    const metrics: Record<string, MetricResult> = {}

    if (metaCampaigns.length > 0) {
        // Get Meta integration token
        const integration = await prisma.adIntegration.findUnique({
            where: { userId_platform: { userId: user.id, platform: AdPlatform.META } },
            include: { token: true }
        })

        if (integration?.token?.accessTokenEncrypted) {
            const accessToken = decrypt(integration.token.accessTokenEncrypted, ENCRYPTION_KEY)

            // Fetch metrics in parallel (up to 10 at a time)
            const batchSize = 10
            for (let i = 0; i < metaCampaigns.length; i += batchSize) {
                const batch = metaCampaigns.slice(i, i + batchSize)
                const results = await Promise.allSettled(
                    batch.map(async (c: any) => {
                        const data = await fetchMetaInsights(c.providerCampaignId, accessToken)
                        return { campaignId: c.id, ...data }
                    })
                )
                for (const result of results) {
                    if (result.status === 'fulfilled') {
                        metrics[result.value.campaignId] = result.value
                    } else {
                        // Find the campaign ID for this failed result
                        const idx = results.indexOf(result)
                        const campaign = batch[idx]
                        if (campaign) {
                            metrics[campaign.id] = {
                                campaignId: campaign.id,
                                impressions: 0, clicks: 0, spend: 0, reach: 0, ctr: 0, cpm: 0,
                                error: result.reason?.message || 'Error al obtener métricas'
                            }
                        }
                    }
                }
            }
        }
    }

    return NextResponse.json({ metrics })
}
