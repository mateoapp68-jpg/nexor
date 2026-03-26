// YouTube Data API v3 publisher

const BASE = 'https://www.googleapis.com/youtube/v3'
const UPLOAD_BASE = 'https://www.googleapis.com/upload/youtube/v3'

async function ytGet(path: string, accessToken: string, params: Record<string, string> = {}) {
    const qs = new URLSearchParams(params).toString()
    const res = await fetch(`${BASE}${path}?${qs}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error?.message || `YouTube error ${res.status}`)
    return data
}

export async function publishYouTubeVideo(opts: {
    accessToken: string
    title: string
    description: string
    videoUrl: string
    scheduledAt?: Date
}): Promise<string> {
    const { accessToken, title, description, videoUrl, scheduledAt } = opts

    // Download video from Supabase URL first
    const videoRes = await fetch(videoUrl)
    if (!videoRes.ok) throw new Error('No se pudo descargar el video para subir a YouTube')
    const videoBuffer = await videoRes.arrayBuffer()
    const contentType = videoRes.headers.get('content-type') || 'video/mp4'
    const contentLength = videoRes.headers.get('content-length') || String(videoBuffer.byteLength)

    const status: any = scheduledAt
        ? { privacyStatus: 'private', publishAt: scheduledAt.toISOString() }
        : { privacyStatus: 'public' }

    // Initiate resumable upload
    const metaRes = await fetch(`${UPLOAD_BASE}/videos?uploadType=resumable&part=snippet,status`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Upload-Content-Type': contentType,
            'X-Upload-Content-Length': contentLength
        },
        body: JSON.stringify({
            snippet: { title: title.slice(0, 100), description: description.slice(0, 5000) },
            status
        })
    })

    if (!metaRes.ok) {
        const err = await metaRes.json()
        throw new Error(err.error?.message || 'YouTube upload init failed')
    }

    const uploadUrl = metaRes.headers.get('location')
    if (!uploadUrl) throw new Error('YouTube no devolvió upload URL')

    // Upload video bytes
    const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
            'Content-Type': contentType,
            'Content-Length': contentLength
        },
        body: videoBuffer
    })

    if (!uploadRes.ok) {
        const err = await uploadRes.json()
        throw new Error(err.error?.message || 'YouTube upload failed')
    }

    const uploaded = await uploadRes.json()
    return uploaded.id
}

export async function getYouTubeUserInfo(accessToken: string) {
    const data = await ytGet('/channels', accessToken, {
        part: 'snippet,statistics',
        mine: 'true'
    })
    const channel = data.items?.[0]
    if (!channel) throw new Error('No se encontró canal de YouTube')
    return {
        id: channel.id,
        name: channel.snippet.title,
        avatar: channel.snippet.thumbnails?.default?.url,
        subscribers: channel.statistics?.subscriberCount
    }
}

export async function getYouTubeMetrics(channelId: string, accessToken: string) {
    const data = await ytGet('/channels', accessToken, {
        part: 'statistics',
        id: channelId
    })
    return data.items?.[0]?.statistics || {}
}

export async function refreshGoogleToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID!,
            client_secret: process.env.GOOGLE_CLIENT_SECRET!,
            refresh_token: refreshToken,
            grant_type: 'refresh_token'
        })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error_description || 'Google refresh error')
    return { accessToken: data.access_token, expiresIn: data.expires_in }
}
