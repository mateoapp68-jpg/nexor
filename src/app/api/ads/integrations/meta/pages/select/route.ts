export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/ads/encryption'

const ENCRYPTION_KEY = process.env.ADS_ENCRYPTION_KEY || ''

export async function POST(req: Request) {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { pageId, pageName, pageAccessToken } = await req.json()
    if (!pageId) return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })

    // Store selected page in SocialConnection so it can be used for ads targeting
    await (prisma as any).socialConnection.upsert({
        where: { userId_network: { userId: user.id, network: 'FACEBOOK' } },
        create: {
            userId: user.id,
            network: 'FACEBOOK',
            accessToken: pageAccessToken ? encrypt(pageAccessToken, ENCRYPTION_KEY) : '',
            accountId: pageId,
            accountName: pageName,
            pageId,
            pageName,
            expiresAt: new Date(Date.now() + 5184000 * 1000)
        },
        update: {
            pageId,
            pageName,
            accountId: pageId,
            accountName: pageName,
            ...(pageAccessToken ? { accessToken: encrypt(pageAccessToken, ENCRYPTION_KEY) } : {})
        }
    })

    return NextResponse.json({ success: true })
}
