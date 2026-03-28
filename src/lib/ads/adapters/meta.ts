import { AdPlatform } from '@prisma/client'
import { IAdsAdapter, AdAccount, CampaignDraftPayload, PublishResult, MetricRow } from '../types'
import { AdsHttpClient } from '../http-client'

export class MetaAdapter implements IAdsAdapter {
    platform = AdPlatform.META
    private api = new AdsHttpClient('https://graph.facebook.com')
    private apiVersion = 'v25.0'

    private appId = process.env.META_APP_ID
    private appSecret = process.env.META_APP_SECRET
    private redirectUri = process.env.META_REDIRECT_URI

    getAuthUrl(state?: string): string {
        if (!this.appId || !this.appSecret || !this.redirectUri) {
            throw new Error('Meta App configuration (ID, Secret, Redirect URI) is missing in environment variables.')
        }
        const scopes = [
            'ads_management',
            'ads_read',
            'business_management',
            'pages_show_list',
            'pages_read_engagement',
            'pages_manage_ads',
            'pages_manage_metadata',
            'public_profile',
            'whatsapp_business_management',
            'instagram_basic'
        ]
        const params = new URLSearchParams({
            client_id: this.appId!,
            redirect_uri: this.redirectUri!,
            scope: scopes.join(','),
            response_type: 'code',
            ...(state ? { state } : {})
        })
        return `https://www.facebook.com/${this.apiVersion}/dialog/oauth?${params.toString()}`
    }

    async exchangeCodeForToken(code: string): Promise<any> {
        if (!this.appId || !this.appSecret || !this.redirectUri) {
            throw new Error('Meta App configuration (ID, Secret, Redirect URI) is missing.')
        }

        const data = await this.api.get<any>(`/${this.apiVersion}/oauth/access_token`, {
            params: {
                client_id: this.appId,
                client_secret: this.appSecret,
                redirect_uri: this.redirectUri,
                code: code
            }
        })

        // Meta tokens can be exchanged for long-lived ones
        const longLived = await this.api.get<any>(`/${this.apiVersion}/oauth/access_token`, {
            params: {
                grant_type: 'fb_exchange_token',
                client_id: this.appId,
                client_secret: this.appSecret,
                fb_exchange_token: data.access_token
            }
        })

        return {
            accessToken: longLived.access_token,
            expiresAt: longLived.expires_in ? new Date(Date.now() + longLived.expires_in * 1000) : undefined,
            tokenType: longLived.token_type || 'bearer'
        }
    }

    async refreshToken(refreshToken: string): Promise<any> {
        // Meta doesn't use standard refresh tokens; long-lived tokens last 60 days
        // Re-exchange is needed if expired.
        throw new Error('Meta tokens must be re-obtained via OAuth after 60 days.')
    }

    async listAdAccounts(accessToken: string): Promise<AdAccount[]> {
        const data = await this.api.get<any>(`/${this.apiVersion}/me/adaccounts`, {
            params: {
                access_token: accessToken,
                fields: 'id,name,currency,timezone_name'
            }
        })

        return (data.data || []).map((acc: any) => ({
            providerAccountId: acc.id,
            displayName: acc.name,
            currency: acc.currency,
            timezone: acc.timezone_name
        }))
    }

    async listPages(accessToken: string): Promise<any[]> {
        const data = await this.api.get<any>(`/${this.apiVersion}/me/accounts`, {
            params: {
                access_token: accessToken,
                fields: 'id,name,access_token,category,connected_instagram_account{id,username,profile_picture_url}'
            }
        })

        const pages = await Promise.all((data.data || []).map(async (page: any) => {
            const pageToken = page.access_token || accessToken
            let whatsappNumber: string | null = null
            let whatsappNumbers: string[] = []

            try {
                // v21.0 with page token — tries whatsapp_number + whatsapp_accounts edge
                const wpRes = await this.api.get<any>(`/v21.0/${page.id}`, {
                    params: {
                        access_token: pageToken,
                        fields: 'whatsapp_number,whatsapp_accounts{phone_number,default_whatsapp_number}'
                    }
                })
                console.log(`[listPages] Page "${page.name}" — whatsapp:`, wpRes.whatsapp_number || 'none')
                whatsappNumber = wpRes.whatsapp_number || null
                const waAccounts = wpRes.whatsapp_accounts?.data || []
                if (waAccounts.length > 0) {
                    whatsappNumbers = waAccounts.map((a: any) => a.phone_number || a.default_whatsapp_number).filter(Boolean)
                    if (!whatsappNumber) whatsappNumber = whatsappNumbers[0] || null
                }
            } catch (e) { console.log(`[listPages] Page "${page.name}" error:`, e) }

            return {
                id: page.id,
                name: page.name,
                category: page.category,
                whatsappNumber,
                whatsappNumbers,
                instagramId: page.connected_instagram_account?.id || null,
                instagramUsername: page.connected_instagram_account?.username || null,
            }
        }))

        return pages
    }

    async listPixels(accessToken: string, adAccountId: string): Promise<any[]> {
        const data = await this.api.get<any>(`/${this.apiVersion}/${adAccountId}/adspixels`, {
            params: {
                access_token: accessToken,
                fields: 'id,name'
            }
        })

        return (data.data || []).map((p: any) => ({
            id: p.id,
            name: p.name
        }))
    }

    async listPagePosts(accessToken: string, pageId: string): Promise<any[]> {
        const data = await this.api.get<any>(`/${this.apiVersion}/${pageId}/published_posts`, {
            params: {
                access_token: accessToken,
                fields: 'id,message,created_time,full_picture,permalink_url'
            }
        })

        return (data.data || []).map((post: any) => ({
            id: post.id,
            message: post.message,
            picture: post.full_picture,
            url: post.permalink_url,
            createdAt: post.created_time
        }))
    }

    /** Searches Meta's Targeting API for a keyword and returns the best matching interest */
    async searchTargetingInterests(accessToken: string, query: string): Promise<Array<{ id: string; name: string }>> {
        try {
            const data = await this.api.get<any>(`/${this.apiVersion}/search`, {
                params: { type: 'adinterest', q: query, access_token: accessToken, limit: '3' }
            })
            return (data.data || []).slice(0, 1).map((i: any) => ({ id: String(i.id), name: String(i.name) }))
        } catch {
            return []
        }
    }

    async publishFromDraft(accessToken: string, adAccountId: string, draft: CampaignDraftPayload): Promise<PublishResult> {
        console.log(`[Meta] Starting publication for: ${draft.name}`)

        // Validate required fields early — Meta rejects empty strings as invalid parameters
        if (!draft.providerPageId) {
            throw new Error('Se requiere una Página de Facebook para publicar en Meta. Selecciónala en la configuración de la campaña.')
        }

        const messagingDest = draft.messengerDestination
        const isMessagingAd = messagingDest === 'WHATSAPP' || messagingDest === 'MESSENGER' || messagingDest === 'INSTAGRAM'

        // Messaging campaigns (click-to-WhatsApp/Messenger/Instagram) MUST use OUTCOME_ENGAGEMENT.
        // Using OUTCOME_LEADS + QUALITY_LEAD with a messaging destination causes "incompatible objective" error.
        const baseObjective = draft.objective || 'OUTCOME_TRAFFIC'
        const effectiveObjective = isMessagingAd ? 'OUTCOME_ENGAGEMENT' : baseObjective

        // 1. Create Campaign
        const campaign = await this.api.post<any>(`/${this.apiVersion}/${adAccountId}/campaigns`, {
            name: draft.name,
            objective: effectiveObjective,
            status: 'ACTIVE',
            special_ad_categories: [],
            // Required when using ad set level budget (not campaign budget optimization)
            is_adset_budget_sharing_enabled: false,
            access_token: accessToken
        })
        const campaignId = campaign.id

        // 2. Create Ad Set — optimization_goal MUST be compatible with effectiveObjective
        let optimizationGoal = 'REACH'
        const billingEvent = 'IMPRESSIONS'
        let destinationType: string | undefined = undefined
        let promotedObject: any = undefined

        if (isMessagingAd) {
            // OUTCOME_ENGAGEMENT + CONVERSATIONS: the only valid combo for WhatsApp/Messenger/Instagram ads
            optimizationGoal = 'CONVERSATIONS'
            if (messagingDest === 'WHATSAPP') destinationType = 'WHATSAPP'
            else if (messagingDest === 'MESSENGER') destinationType = 'MESSENGER_INBOX'
            else destinationType = 'INSTAGRAM_DIRECT'
            if (draft.providerPageId) promotedObject = { page_id: draft.providerPageId }
        } else if (effectiveObjective === 'OUTCOME_LEADS') {
            // Website leads without lead forms → use LINK_CLICKS + WEBSITE
            optimizationGoal = 'LINK_CLICKS'
            destinationType = 'WEBSITE'
            if (draft.providerPageId) promotedObject = { page_id: draft.providerPageId }
        } else if (effectiveObjective === 'OUTCOME_SALES') {
            optimizationGoal = draft.pixelId ? 'OFFSITE_CONVERSIONS' : 'LINK_CLICKS'
            destinationType = 'WEBSITE'
            if (draft.pixelId) {
                promotedObject = { pixel_id: draft.pixelId, custom_event_type: 'PURCHASE' }
            }
        } else if (effectiveObjective === 'OUTCOME_TRAFFIC') {
            optimizationGoal = 'LINK_CLICKS'
            destinationType = 'WEBSITE'
        } else if (effectiveObjective === 'OUTCOME_AWARENESS') {
            optimizationGoal = 'REACH'
            // No destination_type for awareness
        }

        // Targeting
        const targeting: any = {
            age_min: draft.ageMin || 18,
            age_max: draft.ageMax || 65,
        }
        if (draft.gender === 'MALE') targeting.genders = [1]
        else if (draft.gender === 'FEMALE') targeting.genders = [2]

        // AI-generated audience interests → flexible_spec
        if (draft.audienceInterests && draft.audienceInterests.length > 0) {
            targeting.flexible_spec = [{ interests: draft.audienceInterests.map(i => ({ id: i.id, name: i.name })) }]
            console.log(`[Meta] Applying ${draft.audienceInterests.length} audience interests:`, draft.audienceInterests.map(i => i.name).join(', '))
        }

        if (draft.geoLocations) {
            targeting.geo_locations = {}
            if (draft.geoLocations.countries?.length) targeting.geo_locations.countries = draft.geoLocations.countries
            if (draft.geoLocations.regions?.length) targeting.geo_locations.regions = draft.geoLocations.regions.map(r => ({ key: r.key }))
            if (draft.geoLocations.cities?.length) targeting.geo_locations.cities = draft.geoLocations.cities.map(c => ({ key: c.key, radius: c.radius, distance_unit: c.distance_unit }))
            if (draft.geoLocations.custom_locations?.length) targeting.geo_locations.custom_locations = draft.geoLocations.custom_locations
            // Ensure at least one geo is set
            if (!targeting.geo_locations.countries && !targeting.geo_locations.regions && !targeting.geo_locations.cities && !targeting.geo_locations.custom_locations) {
                targeting.geo_locations = { countries: ['US'] }
            }
        } else {
            targeting.geo_locations = { countries: ['US'] }
        }

        const adSetPayload: any = {
            name: `${draft.name} — Ad Set`,
            campaign_id: campaignId,
            billing_event: billingEvent,
            optimization_goal: optimizationGoal,
            // Required: explicit bid strategy — LOWEST_COST_WITHOUT_CAP = automated bidding, no manual bid needed
            bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
            // FIX: Math.round ensures integer cents (Meta rejects floats)
            daily_budget: Math.round(draft.budgetAmount * 100),
            targeting,
            status: 'ACTIVE',
            access_token: accessToken
        }
        if (destinationType) adSetPayload.destination_type = destinationType
        if (promotedObject) adSetPayload.promoted_object = promotedObject

        // Bug #1 fix: if adset creation fails, delete the orphaned campaign in Meta
        let adSetId!: string
        try {
            const adSet = await this.api.post<any>(`/${this.apiVersion}/${adAccountId}/adsets`, adSetPayload)
            adSetId = adSet.id
        } catch (err) {
            // Rollback: delete the campaign we just created so it doesn't stay orphaned in Meta
            try {
                await this.api.post<any>(`/${this.apiVersion}/${campaignId}`, {
                    status: 'DELETED',
                    access_token: accessToken
                })
                console.log(`[Meta] Rolled back orphaned campaign ${campaignId}`)
            } catch (rollbackErr) {
                console.error(`[Meta] Rollback failed for campaign ${campaignId}:`, rollbackErr)
            }
            throw err
        }

        // 3 & 4. Create Creatives + Ads (one per copy variation)
        // Bug #7 fix: errors on individual ads are caught — publish succeeds if at least 1 ad is created
        const isWhatsApp = messagingDest === 'WHATSAPP'
        const isMessenger = messagingDest === 'MESSENGER'
        const isInstagram = messagingDest === 'INSTAGRAM'
        const copies = draft.copies?.length
            ? draft.copies
            : [{ primaryText: draft.primaryText, headline: draft.headline, description: draft.description, imageUrl: draft.assets?.[0]?.storageUrl }]

        let firstAdId: string | undefined
        let adsCreated = 0
        const adErrors: string[] = []

        for (let i = 0; i < copies.length; i++) {
            try {
                const copy = copies[i]
                const assetUrl = copy.imageUrl || draft.assets?.[i]?.storageUrl || draft.assets?.[0]?.storageUrl
                const isVideo = /\.(mp4|mov|avi|mkv|webm|m4v)([?&#]|$)/i.test(assetUrl || '')

                let creativePayload: any

                if (i === 0 && draft.providerPostId) {
                    creativePayload = {
                        name: `${draft.name} — Post`,
                        object_story_id: draft.providerPostId,
                        access_token: accessToken
                    }
                } else if (isVideo && assetUrl) {
                    // Video ad flow: upload video to Meta first, then poll until ready, then use video_data
                    console.log(`[Meta] Uploading video to Meta for ad ${i + 1}:`, assetUrl)
                    const videoUpload = await this.api.post<any>(`/${this.apiVersion}/${adAccountId}/advideos`, {
                        file_url: assetUrl,
                        access_token: accessToken
                    })
                    const metaVideoId = videoUpload.id
                    if (!metaVideoId) throw new Error('Meta no devolvió un video_id al subir el video')

                    // Poll until video is ready (Meta processes async — max 90s)
                    console.log(`[Meta] Waiting for video ${metaVideoId} to be ready...`)
                    const deadline = Date.now() + 90_000
                    let videoReady = false
                    while (Date.now() < deadline) {
                        await new Promise(r => setTimeout(r, 4000))
                        try {
                            const statusRes = await this.api.get<any>(`/${this.apiVersion}/${metaVideoId}`, {
                                params: { fields: 'status', access_token: accessToken }
                            })
                            const vs = statusRes?.status?.video_status
                            console.log(`[Meta] Video ${metaVideoId} status: ${vs}`)
                            if (vs === 'ready') { videoReady = true; break }
                            if (vs === 'error') throw new Error('Meta reportó un error procesando el video. Verifica que el archivo de video sea válido (MP4, H.264, máx 4GB).')
                        } catch (pollErr: any) {
                            if (pollErr.message?.includes('procesando el video')) throw pollErr
                            console.warn(`[Meta] Video status poll error (retrying):`, pollErr.message)
                        }
                    }
                    if (!videoReady) throw new Error('El video tardó demasiado en procesarse en Meta. Intenta con un archivo más pequeño o mejor conexión.')

                    // Obtener thumbnail auto-generado por Meta (requerido en video_data)
                    const thumbRes = await this.api.get<any>(`/${this.apiVersion}/${metaVideoId}`, {
                        params: { fields: 'picture', access_token: accessToken }
                    })
                    const thumbnailUrl: string | undefined = thumbRes?.picture

                    const pageFallbackUrl = `https://www.facebook.com/${draft.providerPageId}`
                    const videoData: any = {
                        video_id: metaVideoId,
                        message: copy.primaryText || draft.primaryText || '',
                        ...(thumbnailUrl ? { image_url: thumbnailUrl } : {}),
                    }
                    if (copy.headline || draft.headline) videoData.title = copy.headline || draft.headline

                    if (isWhatsApp) {
                        videoData.call_to_action = { type: 'WHATSAPP_MESSAGE', value: { app_destination: 'WHATSAPP' } }
                    } else if (isMessenger) {
                        videoData.call_to_action = { type: 'MESSAGE_PAGE', value: { app_destination: 'MESSENGER' } }
                    } else if (isInstagram) {
                        videoData.call_to_action = { type: 'INSTAGRAM_MESSAGE', value: { app_destination: 'INSTAGRAM_DIRECT' } }
                    } else {
                        const destUrl = draft.destinationUrl || pageFallbackUrl
                        videoData.call_to_action = { type: draft.cta || 'LEARN_MORE', value: { link: destUrl } }
                    }

                    creativePayload = {
                        name: `${draft.name} — Creative ${i + 1}`,
                        object_story_spec: {
                            page_id: draft.providerPageId,
                            video_data: videoData
                        },
                        access_token: accessToken
                    }
                } else {
                    // Image ad flow
                    const linkData: any = {
                        message: copy.primaryText || draft.primaryText || ''
                    }
                    if (copy.headline || draft.headline) linkData.name = copy.headline || draft.headline
                    if (copy.description || draft.description) linkData.description = copy.description || draft.description
                    if (assetUrl) linkData.picture = assetUrl

                    const pageFallbackUrl = `https://www.facebook.com/${draft.providerPageId}`

                    if (isWhatsApp) {
                        linkData.link = pageFallbackUrl
                        linkData.call_to_action = { type: 'WHATSAPP_MESSAGE', value: { app_destination: 'WHATSAPP' } }
                    } else if (isMessenger) {
                        linkData.link = pageFallbackUrl
                        linkData.call_to_action = { type: 'MESSAGE_PAGE', value: { app_destination: 'MESSENGER' } }
                    } else if (isInstagram) {
                        linkData.link = pageFallbackUrl
                        linkData.call_to_action = { type: 'INSTAGRAM_MESSAGE', value: { app_destination: 'INSTAGRAM_DIRECT' } }
                    } else {
                        const destUrl = draft.destinationUrl || pageFallbackUrl
                        linkData.link = destUrl
                        linkData.call_to_action = { type: draft.cta || 'LEARN_MORE', value: { link: destUrl } }
                    }

                    creativePayload = {
                        name: `${draft.name} — Creative ${i + 1}`,
                        object_story_spec: {
                            page_id: draft.providerPageId,
                            link_data: linkData
                        },
                        access_token: accessToken
                    }
                }

                const creative = await this.api.post<any>(`/${this.apiVersion}/${adAccountId}/adcreatives`, creativePayload)

                const adPayload: any = {
                    name: `${draft.name} — Ad ${i + 1}`,
                    adset_id: adSetId,
                    creative: { creative_id: creative.id },
                    status: 'ACTIVE',
                    access_token: accessToken
                }
                if (draft.pixelId) {
                    adPayload.tracking_specs = [{ 'action.type': 'offsite_conversion', 'fb_pixel': [draft.pixelId] }]
                }

                const ad = await this.api.post<any>(`/${this.apiVersion}/${adAccountId}/ads`, adPayload)
                if (!firstAdId) firstAdId = ad.id
                adsCreated++
            } catch (adErr: any) {
                const msg = adErr?.message || adErr?.error?.message || String(adErr)
                console.error(`[Meta] Failed to create ad ${i + 1}/${copies.length}:`, adErr)
                adErrors.push(`Variación ${i + 1}: ${msg}`)
                // Continue — try remaining copies
            }
        }

        if (adsCreated === 0) {
            const detail = adErrors.length > 0 ? ` — ${adErrors[0]}` : ''
            throw new Error(`No se pudo crear ningún anuncio${detail}`)
        }

        return {
            providerCampaignId: campaignId,
            providerGroupId: adSetId,
            providerAdId: firstAdId
        }
    }

    async pauseCampaign(accessToken: string, adAccountId: string, providerCampaignId: string): Promise<boolean> {
        const res = await this.api.post<any>(`/${this.apiVersion}/${providerCampaignId}`, {
            status: 'PAUSED',
            access_token: accessToken
        })
        return res.success
    }

    async resumeCampaign(accessToken: string, adAccountId: string, providerCampaignId: string): Promise<boolean> {
        const res = await this.api.post<any>(`/${this.apiVersion}/${providerCampaignId}`, {
            status: 'ACTIVE',
            access_token: accessToken
        })
        return res.success
    }

    async fetchDailyMetrics(accessToken: string, adAccountId: string, from: Date, to: Date): Promise<MetricRow[]> {
        const data = await this.api.get<any>(`/${this.apiVersion}/${adAccountId}/insights`, {
            params: {
                time_range: JSON.stringify({
                    since: from.toISOString().split('T')[0],
                    until: to.toISOString().split('T')[0]
                }),
                fields: 'campaign_id,spend,impressions,clicks,conversions,date_start',
                level: 'campaign',
                access_token: accessToken
            }
        })

        return (data.data || []).map((row: any) => ({
            providerCampaignId: row.campaign_id,
            date: new Date(row.date_start),
            spend: parseFloat(row.spend) || 0,
            impressions: parseInt(row.impressions) || 0,
            clicks: parseInt(row.clicks) || 0,
            conversions: parseInt(row.conversions?.[0]?.value) || 0 // Very simplified conversion fetch
        }))
    }

    async searchLocations(accessToken: string, query: string, type: string = 'adgeolocation'): Promise<any[]> {
        const data = await this.api.get<any>(`/${this.apiVersion}/search`, {
            params: {
                type: type,
                q: query,
                access_token: accessToken
            }
        })

        return (data.data || []).map((item: any) => ({
            key: item.key,
            name: item.name,
            type: item.type,
            countryCode: item.country_code,
            countryName: item.country_name,
            region: item.region
        }))
    }
}
