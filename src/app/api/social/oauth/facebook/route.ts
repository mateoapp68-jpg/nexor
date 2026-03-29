export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const GRAPH = 'https://graph.facebook.com/v21.0'
const APP_ID = process.env.META_APP_ID!
const APP_SECRET = process.env.META_APP_SECRET!
const REDIRECT_URI = process.env.SOCIAL_FACEBOOK_REDIRECT_URI || process.env.META_REDIRECT_URI!
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://nex180.site'

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    if (error) return NextResponse.redirect(new URL('/dashboard/services/social?error=facebook_denied', APP_URL))

    if (!code) {
        const user = await getAuthUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        const scopes = 'pages_show_list,pages_read_engagement,pages_manage_posts,read_insights,instagram_basic,instagram_content_publish,instagram_manage_insights'
        const authUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${scopes}&response_type=code&state=${user.id}`
        return NextResponse.redirect(authUrl)
    }

    try {
        // Exchange code for short-lived token
        const tokenRes = await fetch(`${GRAPH}/oauth/access_token?client_id=${APP_ID}&client_secret=${APP_SECRET}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&code=${code}`)
        const tokenData = await tokenRes.json()
        if (!tokenRes.ok || tokenData.error) throw new Error(tokenData.error?.message || 'FB token error')

        // Exchange for long-lived token
        const llRes = await fetch(`${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${tokenData.access_token}`)
        const llData = await llRes.json()
        const longToken = llData.access_token || tokenData.access_token
        const expiresAt = new Date(Date.now() + (llData.expires_in || 5184000) * 1000)

        // Get user info
        const meRes = await fetch(`${GRAPH}/me?fields=id,name,picture&access_token=${longToken}`)
        const meData = await meRes.json()

        // Get pages (include access_token and instagram account in fields)
        const pagesRes = await fetch(`${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${longToken}`)
        const pagesData = await pagesRes.json()
        const pages = pagesData.data || []

        const userId = state!

        // Save Facebook connection (user-level) — always store the user-level long-lived token
        // so that me/accounts can be called later to fetch all managed pages
        await (prisma as any).socialConnection.upsert({
            where: { userId_network: { userId, network: 'FACEBOOK' } },
            update: {
                accessToken: longToken,
                accountId: meData.id,
                accountName: meData.name,
                accountAvatar: meData.picture?.data?.url,
                pageId: pages[0]?.id || null,
                pageName: pages[0]?.name || null,
                expiresAt
            },
            create: {
                userId,
                network: 'FACEBOOK',
                accessToken: longToken,
                accountId: meData.id,
                accountName: meData.name,
                accountAvatar: meData.picture?.data?.url,
                pageId: pages[0]?.id || null,
                pageName: pages[0]?.name || null,
                expiresAt
            }
        })

        // Also save Instagram if linked — check all pages, not just pages[0]
        for (const page of pages) {
            try {
                const pageToken = page.access_token || longToken
                // Instagram account may already be in the pages response
                let igId = page.instagram_business_account?.id
                if (!igId) {
                    // Fallback: fetch explicitly
                    const igRes = await fetch(`${GRAPH}/${page.id}?fields=instagram_business_account&access_token=${pageToken}`)
                    const igData = await igRes.json()
                    igId = igData.instagram_business_account?.id
                }
                if (!igId) continue

                const igInfoRes = await fetch(`${GRAPH}/${igId}?fields=name,username,profile_picture_url&access_token=${pageToken}`)
                const igInfo = await igInfoRes.json()

                await (prisma as any).socialConnection.upsert({
                    where: { userId_network: { userId, network: 'INSTAGRAM' } },
                    update: {
                        accessToken: pageToken,
                        accountId: igId,
                        accountName: igInfo.name || igInfo.username || 'Instagram',
                        accountAvatar: igInfo.profile_picture_url,
                        pageId: page.id,
                        pageName: page.name,
                        expiresAt
                    },
                    create: {
                        userId,
                        network: 'INSTAGRAM',
                        accessToken: pageToken,
                        accountId: igId,
                        accountName: igInfo.name || igInfo.username || 'Instagram',
                        accountAvatar: igInfo.profile_picture_url,
                        pageId: page.id,
                        pageName: page.name,
                        expiresAt
                    }
                })
                break // Save first Instagram found
            } catch (e) {
                console.warn('[Social OAuth] Instagram fetch failed for page', page.id, e)
            }
        }

        return NextResponse.redirect(new URL('/dashboard/services/social?connected=facebook', APP_URL))
    } catch (err: any) {
        console.error('[Facebook Social OAuth]', err)
        return NextResponse.redirect(new URL(`/dashboard/services/social?error=${encodeURIComponent(err.message)}`, APP_URL))
    }
}
