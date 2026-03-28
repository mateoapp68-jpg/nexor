export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { AdapterFactory } from '@/lib/ads/factory'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/ads/encryption'

const ENCRYPTION_KEY = process.env.ADS_ENCRYPTION_KEY || ''

export async function GET() {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const integration = await prisma.adIntegration.findUnique({
        where: { userId_platform: { userId: user.id, platform: 'META' } },
        include: { token: true }
    })

    if (!integration?.token) return NextResponse.json({ error: 'Meta no conectado' }, { status: 400 })

    try {
        const adapter = AdapterFactory.getAdapter('META')
        const accessToken = decrypt(integration.token.accessTokenEncrypted, ENCRYPTION_KEY)
        const pages = await adapter.listPages(accessToken)
        return NextResponse.json({ pages })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
