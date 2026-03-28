export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

const META_APP_ID = process.env.META_APP_ID!
const REDIRECT_URI = process.env.META_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/ads/integrations/meta/connect/callback`

const SCOPES = [
    'ads_management',
    'ads_read',
    'business_management',
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_ads',
    'pages_manage_metadata',
    'whatsapp_business_management',
    'whatsapp_business_messaging',
    'public_profile'
].join(',')

export async function POST(req: Request) {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!META_APP_ID) return NextResponse.json({ error: 'META_APP_ID no configurado' }, { status: 500 })

    const authUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${SCOPES}&response_type=code&state=${user.id}`

    return NextResponse.json({ authUrl })
}
