export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getFacebookMetrics } from '@/lib/social/facebook'
import { getInstagramMetrics } from '@/lib/social/instagram'
import { getYouTubeMetrics, getYouTubeUserInfo } from '@/lib/social/youtube'

export async function GET() {
    try {
        const user = await getAuthUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const connections = await (prisma as any).socialConnection.findMany({
            where: { userId: user.id }
        })

        const metrics: Record<string, any> = {}

        await Promise.allSettled(connections.map(async (conn: any) => {
            try {
                switch (conn.network) {
                    case 'FACEBOOK':
                        metrics.FACEBOOK = await getFacebookMetrics(conn.pageId || conn.accountId, conn.accessToken)
                        break
                    case 'INSTAGRAM':
                        metrics.INSTAGRAM = await getInstagramMetrics(conn.accountId, conn.accessToken)
                        break
                    case 'YOUTUBE': {
                        const ytInfo = await getYouTubeUserInfo(conn.accessToken)
                        metrics.YOUTUBE = await getYouTubeMetrics(ytInfo.id, conn.accessToken)
                        break
                    }
                }
            } catch (e: any) {
                metrics[conn.network] = { error: e.message }
            }
        }))

        // Post stats from DB
        const postStats = await (prisma as any).socialPost.groupBy({
            by: ['status'],
            where: { userId: user.id },
            _count: { id: true }
        })

        const networkStats = await (prisma as any).socialPostNetwork.groupBy({
            by: ['network', 'status'],
            where: { post: { userId: user.id } },
            _count: { id: true }
        })

        return NextResponse.json({ metrics, postStats, networkStats })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
