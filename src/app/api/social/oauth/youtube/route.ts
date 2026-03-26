export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getYouTubeUserInfo } from '@/lib/social/youtube'

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!
const REDIRECT_URI = process.env.YOUTUBE_REDIRECT_URI!

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    if (error) {
        return NextResponse.redirect(new URL('/dashboard/services/social?error=youtube_denied', req.url))
    }

    if (!code) {
        const user = await getAuthUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const scopes = [
            'https://www.googleapis.com/auth/youtube.upload',
            'https://www.googleapis.com/auth/youtube.readonly',
            'https://www.googleapis.com/auth/yt-analytics.readonly'
        ].join(' ')

        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent&state=${user.id}`
        return NextResponse.redirect(authUrl)
    }

    try {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                code,
                grant_type: 'authorization_code',
                redirect_uri: REDIRECT_URI
            })
        })
        const tokenData = await tokenRes.json()
        if (!tokenRes.ok) throw new Error(tokenData.error_description || 'YouTube token error')

        const channelInfo = await getYouTubeUserInfo(tokenData.access_token)
        const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000)

        const userId = state!

        await (prisma as any).socialConnection.upsert({
            where: { userId_network: { userId, network: 'YOUTUBE' } },
            update: {
                accessToken: tokenData.access_token,
                refreshToken: tokenData.refresh_token,
                accountId: channelInfo.id,
                accountName: channelInfo.name,
                accountAvatar: channelInfo.avatar,
                expiresAt
            },
            create: {
                userId,
                network: 'YOUTUBE',
                accessToken: tokenData.access_token,
                refreshToken: tokenData.refresh_token,
                accountId: channelInfo.id,
                accountName: channelInfo.name,
                accountAvatar: channelInfo.avatar,
                expiresAt
            }
        })

        return NextResponse.redirect(new URL('/dashboard/services/social?connected=youtube', req.url))
    } catch (err: any) {
        console.error('[YouTube OAuth]', err)
        return NextResponse.redirect(new URL(`/dashboard/services/social?error=${encodeURIComponent(err.message)}`, req.url))
    }
}
