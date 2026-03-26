// TikTok Content Posting API

const BASE = 'https://open.tiktokapis.com/v2'

async function tkPost(path: string, accessToken: string, body: any) {
    const res = await fetch(`${BASE}${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json; charset=UTF-8',
            'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(body)
    })
    const data = await res.json()
    if (!res.ok || data.error?.code !== 'ok') {
        throw new Error(data.error?.message || `TikTok error ${res.status}`)
    }
    return data.data
}

export async function publishTikTokVideo(opts: {
    accessToken: string
    content: string
    videoUrl: string
    scheduledAt?: Date
}): Promise<string> {
    const { accessToken, content, videoUrl, scheduledAt } = opts

    const postPayload: any = {
        post_info: {
            title: content.slice(0, 2200),
            privacy_level: 'PUBLIC_TO_EVERYONE',
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
        },
        source_info: {
            source: 'PULL_FROM_URL',
            video_url: videoUrl
        }
    }

    if (scheduledAt) {
        postPayload.post_info.auto_add_music = true
        postPayload.schedule_time = Math.floor(scheduledAt.getTime() / 1000)
    }

    const data = await tkPost('/post/publish/video/init/', accessToken, postPayload)
    return data.publish_id
}

export async function getTikTokUserInfo(accessToken: string) {
    const res = await fetch(`${BASE}/user/info/?fields=open_id,union_id,avatar_url,display_name`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    const data = await res.json()
    if (!res.ok || data.error?.code !== 'ok') throw new Error(data.error?.message || 'TikTok auth error')
    return data.data.user
}

export async function refreshTikTokToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const clientKey = process.env.TIKTOK_CLIENT_KEY!
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET!
    const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_key: clientKey,
            client_secret: clientSecret,
            grant_type: 'refresh_token',
            refresh_token: refreshToken
        })
    })
    const data = await res.json()
    if (!res.ok || data.error) throw new Error(data.error_description || 'TikTok refresh error')
    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in
    }
}
