// Instagram Graph API publisher (Business/Creator accounts only)

const BASE = 'https://graph.facebook.com/v21.0'

async function igPost(path: string, body: Record<string, any>) {
    const res = await fetch(`${BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    })
    const data = await res.json()
    if (!res.ok || data.error) throw new Error(data.error?.message || `Instagram error ${res.status}`)
    return data
}

async function igGet(path: string, params: Record<string, string>) {
    const qs = new URLSearchParams(params).toString()
    const res = await fetch(`${BASE}${path}?${qs}`)
    const data = await res.json()
    if (!res.ok || data.error) throw new Error(data.error?.message || `Instagram error ${res.status}`)
    return data
}

async function waitForContainer(_igUserId: string, containerId: string, accessToken: string) {
    const deadline = Date.now() + 60_000
    while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 3000))
        const status = await igGet(`/${containerId}`, { fields: 'status_code', access_token: accessToken })
        if (status.status_code === 'FINISHED') return
        if (status.status_code === 'ERROR') throw new Error('Instagram rechazó el media. Verifica formato y tamaño.')
    }
    throw new Error('Instagram tardó demasiado procesando el media.')
}

export async function publishInstagramPost(opts: {
    igUserId: string
    accessToken: string
    content: string
    mediaUrl?: string
    mediaType?: string
    scheduledAt?: Date
}): Promise<string> {
    const { igUserId, accessToken, content, mediaUrl, mediaType } = opts

    if (!mediaUrl) throw new Error('Instagram requiere al menos una imagen o video')

    const isVideo = mediaType === 'video'
    const containerPayload: any = {
        caption: content,
        access_token: accessToken
    }

    if (isVideo) {
        containerPayload.media_type = 'REELS'
        containerPayload.video_url = mediaUrl
        containerPayload.share_to_feed = true
    } else {
        containerPayload.image_url = mediaUrl
    }

    // Step 1: create container
    const container = await igPost(`/${igUserId}/media`, containerPayload)
    const containerId = container.id
    if (!containerId) throw new Error('Instagram no devolvió container ID')

    // Step 2: wait for container to be ready
    await waitForContainer(igUserId, containerId, accessToken)

    // Step 3: publish
    const result = await igPost(`/${igUserId}/media_publish`, {
        creation_id: containerId,
        access_token: accessToken
    })
    return result.id
}

export async function publishInstagramStory(opts: {
    igUserId: string
    accessToken: string
    mediaUrl: string
    mediaType: string
}): Promise<string> {
    const { igUserId, accessToken, mediaUrl, mediaType } = opts

    const isVideo = mediaType === 'video'
    const containerPayload: any = {
        media_type: 'STORIES',
        access_token: accessToken
    }
    if (isVideo) containerPayload.video_url = mediaUrl
    else containerPayload.image_url = mediaUrl

    const container = await igPost(`/${igUserId}/media`, containerPayload)
    await waitForContainer(igUserId, container.id, accessToken)

    const result = await igPost(`/${igUserId}/media_publish`, {
        creation_id: container.id,
        access_token: accessToken
    })
    return result.id
}

export async function getInstagramMetrics(igUserId: string, accessToken: string) {
    const result: Record<string, any> = {}

    // Basic account info (followers, media count)
    try {
        const info = await igGet(`/${igUserId}`, {
            fields: 'followers_count,media_count,username',
            access_token: accessToken
        })
        result['Seguidores'] = info.followers_count ?? 0
        result['Publicaciones'] = info.media_count ?? 0
    } catch {}

    // Insights (requires instagram_manage_insights permission)
    try {
        const data = await igGet(`/${igUserId}/insights`, {
            metric: 'reach,accounts_engaged,profile_views,total_interactions',
            metric_type: 'total_value',
            period: 'day',
            access_token: accessToken
        })
        for (const item of data.data || []) {
            const value = item.total_value?.value ?? 0
            const label = item.name === 'reach' ? 'Alcance'
                : item.name === 'accounts_engaged' ? 'Cuentas activas'
                : item.name === 'profile_views' ? 'Visitas al perfil'
                : item.name === 'total_interactions' ? 'Interacciones'
                : item.name
            result[label] = value
        }
    } catch {}

    return result
}
