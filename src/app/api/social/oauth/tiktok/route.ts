export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTikTokUserInfo } from '@/lib/social/tiktok'

const CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY!
const CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET!
const REDIRECT_URI = process.env.SOCIAL_TIKTOK_REDIRECT_URI || process.env.TIKTOK_REDIRECT_URI!

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    if (error) {
        return NextResponse.redirect(new URL('/dashboard/services/social?error=tiktok_denied', req.url))
    }

    if (!code) {
        // Redirect to TikTok OAuth
        const user = await getAuthUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const authUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${CLIENT_KEY}&scope=user.info.basic,video.publish,video.upload&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${user.id}`
        return NextResponse.redirect(authUrl)
    }

    // Exchange code for token
    try {
        const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_key: CLIENT_KEY,
                client_secret: CLIENT_SECRET,
                code,
                grant_type: 'authorization_code',
                redirect_uri: REDIRECT_URI
            })
        })
        const tokenData = await tokenRes.json()
        if (!tokenRes.ok || tokenData.error) throw new Error(tokenData.error_description || 'TikTok token error')

        const userInfo = await getTikTokUserInfo(tokenData.access_token)
        const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000)

        // state = userId
        const userId = state!

        await (prisma as any).socialConnection.upsert({
            where: { userId_network: { userId, network: 'TIKTOK' } },
            update: {
                accessToken: tokenData.access_token,
                refreshToken: tokenData.refresh_token,
                accountId: userInfo.open_id,
                accountName: userInfo.display_name,
                accountAvatar: userInfo.avatar_url,
                expiresAt
            },
            create: {
                userId,
                network: 'TIKTOK',
                accessToken: tokenData.access_token,
                refreshToken: tokenData.refresh_token,
                accountId: userInfo.open_id,
                accountName: userInfo.display_name,
                accountAvatar: userInfo.avatar_url,
                expiresAt
            }
        })

        return NextResponse.redirect(new URL('/dashboard/services/social?connected=tiktok', req.url))
    } catch (err: any) {
        console.error('[TikTok OAuth]', err)
        return NextResponse.redirect(new URL(`/dashboard/services/social?error=${encodeURIComponent(err.message)}`, req.url))
    }
}
