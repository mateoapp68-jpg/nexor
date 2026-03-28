export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/ads/encryption'

const GRAPH = 'https://graph.facebook.com/v21.0'
const META_APP_ID = process.env.META_APP_ID!
const META_APP_SECRET = process.env.META_APP_SECRET!
const REDIRECT_URI = process.env.META_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/ads/integrations/meta/connect/callback`
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const ENCRYPTION_KEY = process.env.ADS_ENCRYPTION_KEY || ''

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state') // userId
    const error = searchParams.get('error')

    if (error) return NextResponse.redirect(new URL('/dashboard/services/ads/setup?error=meta_denied', APP_URL))
    if (!code || !state) return NextResponse.redirect(new URL('/dashboard/services/ads/setup?error=invalid_callback', APP_URL))

    try {
        // Exchange code for short-lived token
        const tokenRes = await fetch(`${GRAPH}/oauth/access_token?client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&code=${code}`)
        const tokenData = await tokenRes.json()
        if (tokenData.error) throw new Error(tokenData.error.message)

        // Exchange for long-lived token (60 days)
        const llRes = await fetch(`${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&fb_exchange_token=${tokenData.access_token}`)
        const llData = await llRes.json()
        const longToken = llData.access_token || tokenData.access_token
        const expiresAt = llData.expires_in ? new Date(Date.now() + llData.expires_in * 1000) : undefined

        // Get user info
        const meRes = await fetch(`${GRAPH}/me?fields=id,name&access_token=${longToken}`)
        const meData = await meRes.json()

        const userId = state

        // Store integration
        const integration = await prisma.adIntegration.upsert({
            where: { userId_platform: { userId, platform: 'META' } },
            create: {
                userId,
                platform: 'META',
                status: 'CONNECTED',
                scopes: ['ads_management', 'ads_read', 'business_management', 'pages_show_list',
                    'pages_read_engagement', 'pages_manage_ads', 'pages_manage_metadata', 'public_profile']
            },
            update: { status: 'CONNECTED' }
        })

        // Store token
        await prisma.adOAuthToken.upsert({
            where: { integrationId: integration.id },
            create: {
                integrationId: integration.id,
                accessTokenEncrypted: encrypt(longToken, ENCRYPTION_KEY),
                refreshTokenEncrypted: null,
                expiresAt: expiresAt ?? null,
                tokenType: 'bearer'
            },
            update: {
                accessTokenEncrypted: encrypt(longToken, ENCRYPTION_KEY),
                refreshTokenEncrypted: null,
                expiresAt: expiresAt ?? null,
                tokenType: 'bearer'
            }
        })

        return NextResponse.redirect(new URL('/dashboard/services/ads/setup?connected=meta', APP_URL))
    } catch (err: any) {
        console.error('[Meta Ads OAuth callback]', err)
        return NextResponse.redirect(new URL(`/dashboard/services/ads/setup?error=${encodeURIComponent(err.message)}`, APP_URL))
    }
}
