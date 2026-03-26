// Unified social media publisher

import { publishFacebookPost, publishFacebookStory } from './facebook'
import { publishInstagramPost, publishInstagramStory } from './instagram'
import { publishTikTokVideo } from './tiktok'
import { publishYouTubeVideo } from './youtube'

export interface PublishTarget {
    network: string
    connectionId: string
    accountId: string
    accessToken: string
    pageId?: string
    postType: 'feed' | 'story'
}

export interface PublishPayload {
    content: string
    mediaUrl?: string
    mediaType?: string
    scheduledAt?: Date
    targets: PublishTarget[]
}

export interface PublishNetworkResult {
    connectionId: string
    network: string
    success: boolean
    providerPostId?: string
    error?: string
}

export async function publishToNetworks(payload: PublishPayload): Promise<PublishNetworkResult[]> {
    const results = await Promise.allSettled(
        payload.targets.map(target => publishToNetwork(payload, target))
    )

    return results.map((r, i) => {
        const target = payload.targets[i]
        if (r.status === 'fulfilled') return r.value
        return {
            connectionId: target.connectionId,
            network: target.network,
            success: false,
            error: r.reason?.message || 'Error desconocido'
        }
    })
}

async function publishToNetwork(payload: PublishPayload, target: PublishTarget): Promise<PublishNetworkResult> {
    const { content, mediaUrl, mediaType, scheduledAt } = payload
    const { network, connectionId, accessToken, pageId, postType } = target

    let providerPostId: string

    switch (network) {
        case 'FACEBOOK': {
            if (!pageId) throw new Error('Facebook requiere una Página conectada')
            if (postType === 'story') {
                if (!mediaUrl) throw new Error('Facebook Stories requiere imagen o video')
                providerPostId = await publishFacebookStory({ pageId, accessToken, mediaUrl, mediaType: mediaType || 'image' })
            } else {
                providerPostId = await publishFacebookPost({ pageId, accessToken, content, mediaUrl, mediaType, scheduledAt })
            }
            break
        }
        case 'INSTAGRAM': {
            const igUserId = target.accountId
            if (postType === 'story') {
                if (!mediaUrl) throw new Error('Instagram Stories requiere imagen o video')
                providerPostId = await publishInstagramStory({ igUserId, accessToken, mediaUrl, mediaType: mediaType || 'image' })
            } else {
                providerPostId = await publishInstagramPost({ igUserId, accessToken, content, mediaUrl, mediaType, scheduledAt })
            }
            break
        }
        case 'TIKTOK': {
            if (!mediaUrl || mediaType !== 'video') throw new Error('TikTok solo acepta videos')
            providerPostId = await publishTikTokVideo({ accessToken, content, videoUrl: mediaUrl, scheduledAt })
            break
        }
        case 'YOUTUBE': {
            if (!mediaUrl || mediaType !== 'video') throw new Error('YouTube solo acepta videos')
            const title = content.split('\n')[0].slice(0, 100) || 'Video'
            providerPostId = await publishYouTubeVideo({ accessToken, title, description: content, videoUrl: mediaUrl, scheduledAt })
            break
        }
        default:
            throw new Error(`Red no soportada: ${network}`)
    }

    return { connectionId, network, success: true, providerPostId }
}
