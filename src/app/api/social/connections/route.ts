export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
    try {
        const user = await getAuthUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const connections = await (prisma as any).socialConnection.findMany({
            where: { userId: user.id },
            select: {
                id: true, network: true, accountId: true, accountName: true,
                accountAvatar: true, pageId: true, pageName: true, expiresAt: true, createdAt: true
            }
        })

        return NextResponse.json({ connections })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}

export async function DELETE(req: Request) {
    try {
        const user = await getAuthUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { network } = await req.json()
        await (prisma as any).socialConnection.deleteMany({
            where: { userId: user.id, network }
        })

        return NextResponse.json({ success: true })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
