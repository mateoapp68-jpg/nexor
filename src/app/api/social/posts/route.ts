export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { publishToNetworks } from '@/lib/social/publisher'
import { supabaseAdmin } from '@/lib/supabase'
import { createNotification } from '@/lib/notifications'

const BUCKET = 'social-media'

// Limits per plan
const PLAN_LIMITS: Record<string, { scheduledSlots: number; monthlyPosts: number }> = {
    BASIC:  { scheduledSlots: 5,  monthlyPosts: 15 },
    PRO:    { scheduledSlots: 10, monthlyPosts: 30 },
    ELITE:  { scheduledSlots: 20, monthlyPosts: 50 },
    NONE:   { scheduledSlots: 0,  monthlyPosts: 0  },
}

async function deleteMedia(mediaUrl: string | null) {
    if (!mediaUrl) return
    const marker = `/object/public/${BUCKET}/`
    const idx = mediaUrl.indexOf(marker)
    if (idx === -1) return
    const path = mediaUrl.slice(idx + marker.length).split('?')[0]
    try { await supabaseAdmin.storage.from(BUCKET).remove([path]) } catch {}
}

export async function GET(req: Request) {
    try {
        const user = await getAuthUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { searchParams } = new URL(req.url)
        const status = searchParams.get('status')
        const from = searchParams.get('from')
        const to = searchParams.get('to')

        const where: any = { userId: user.id }
        if (status) where.status = status
        if (from || to) {
            where.scheduledAt = {}
            if (from) where.scheduledAt.gte = new Date(from)
            if (to) where.scheduledAt.lte = new Date(to)
        }

        const posts = await (prisma as any).socialPost.findMany({
            where,
            include: { networks: true },
            orderBy: { createdAt: 'desc' },
            take: 100
        })

        // Return limits info for UI
        const limits = PLAN_LIMITS[user.plan] ?? PLAN_LIMITS.NONE
        const billingStart = user.planExpiresAt
            ? new Date(new Date(user.planExpiresAt).getTime() - 30 * 24 * 60 * 60 * 1000)
            : new Date()
        const [scheduledCount, monthlyCount] = await Promise.all([
            (prisma as any).socialPost.count({ where: { userId: user.id, status: 'SCHEDULED' } }),
            (prisma as any).socialPost.count({ where: { userId: user.id, createdAt: { gte: billingStart } } }),
        ])

        return NextResponse.json({ posts, limits, scheduledCount, monthlyCount })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const user = await getAuthUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        // Plan check
        if (!['BASIC', 'PRO', 'ELITE'].includes(user.plan)) {
            return NextResponse.json({ error: 'Este servicio requiere plan BASIC, PRO o ELITE' }, { status: 403 })
        }

        const body = await req.json()
        const { content, mediaUrl, mediaType, postType = 'feed', scheduledAt, networks: selectedNetworks, pageSelections } = body
        // pageSelections: { FACEBOOK?: { pageId, pageAccessToken }, INSTAGRAM?: { accountId, pageAccessToken } }

        if (!content?.trim()) return NextResponse.json({ error: 'El contenido no puede estar vacío' }, { status: 400 })
        if (content.length > 5000) return NextResponse.json({ error: 'El contenido no puede superar los 5000 caracteres' }, { status: 400 })
        if (!selectedNetworks?.length) return NextResponse.json({ error: 'Selecciona al menos una red social' }, { status: 400 })
        if (!Array.isArray(selectedNetworks) || selectedNetworks.some((n: any) => typeof n !== 'string')) {
            return NextResponse.json({ error: 'Redes sociales inválidas' }, { status: 400 })
        }

        const schedDate = scheduledAt ? new Date(scheduledAt) : null
        if (schedDate && schedDate <= new Date()) {
            return NextResponse.json({ error: 'La fecha de programación debe ser en el futuro' }, { status: 400 })
        }
        const isScheduled = !!schedDate

        // --- Plan limits ---
        const limits = PLAN_LIMITS[user.plan] ?? PLAN_LIMITS.NONE

        // Billing period start = planExpiresAt - 30 days
        const billingStart = user.planExpiresAt
            ? new Date(new Date(user.planExpiresAt).getTime() - 30 * 24 * 60 * 60 * 1000)
            : new Date()

        const [scheduledCount, monthlyCount] = await Promise.all([
            (prisma as any).socialPost.count({ where: { userId: user.id, status: 'SCHEDULED' } }),
            (prisma as any).socialPost.count({ where: { userId: user.id, createdAt: { gte: billingStart } } }),
        ])

        // Monthly limit applies to all posts (scheduled + immediate)
        if (monthlyCount >= limits.monthlyPosts) {
            return NextResponse.json({
                error: `Alcanzaste el límite mensual de ${limits.monthlyPosts} publicaciones para tu plan ${user.plan}. Se renueva con tu próximo ciclo de facturación.`
            }, { status: 403 })
        }

        // Scheduled slots limit only applies to scheduling
        if (isScheduled && scheduledCount >= limits.scheduledSlots) {
            return NextResponse.json({
                error: `Solo puedes tener ${limits.scheduledSlots} publicaciones programadas a la vez con tu plan ${user.plan}. Espera a que se publiquen las actuales.`
            }, { status: 403 })
        }

        // Get user's connections for selected networks
        const connections = await (prisma as any).socialConnection.findMany({
            where: { userId: user.id, network: { in: selectedNetworks } }
        })

        if (!connections.length) return NextResponse.json({ error: 'No tienes cuentas conectadas para las redes seleccionadas' }, { status: 400 })

        // Create post record
        const post = await (prisma as any).socialPost.create({
            data: {
                userId: user.id,
                content,
                mediaUrl: mediaUrl || null,
                mediaType: mediaType || null,
                postType,
                status: isScheduled ? 'SCHEDULED' : 'PUBLISHING',
                scheduledAt: schedDate,
                networks: {
                    create: connections.map((c: any) => ({
                        connectionId: c.id,
                        network: c.network,
                        status: 'PENDING'
                    }))
                }
            },
            include: { networks: true }
        })

        if (isScheduled) {
            const networkLabels = connections.map((c: any) => c.network).join(', ')
            const schedLabel = schedDate!.toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })
            await createNotification(
                user.id,
                '📅 Post programado',
                `Tu publicación en ${networkLabels} está programada para el ${schedLabel}.`,
                '/dashboard/services/social'
            )
            return NextResponse.json({
                post,
                scheduled: true,
                scheduledCount: scheduledCount + 1,
                monthlyCount: monthlyCount + 1,
                limits
            })
        }

        // Publish now — override pageId/accessToken/accountId si el usuario seleccionó una página específica
        const targets = connections.map((c: any) => {
            const sel = pageSelections?.[c.network]
            if (c.network === 'FACEBOOK' && sel?.pageId) {
                return { network: c.network, connectionId: c.id, accountId: c.accountId, accessToken: sel.pageAccessToken || c.accessToken, pageId: sel.pageId, postType }
            }
            if (c.network === 'INSTAGRAM' && sel?.accountId) {
                return { network: c.network, connectionId: c.id, accountId: sel.accountId, accessToken: sel.pageAccessToken || c.accessToken, pageId: c.pageId || undefined, postType }
            }
            return { network: c.network, connectionId: c.id, accountId: c.accountId, accessToken: c.accessToken, pageId: c.pageId || undefined, postType }
        })

        const results = await publishToNetworks({ content, mediaUrl, mediaType, targets })

        // Update each network result
        for (const result of results) {
            await (prisma as any).socialPostNetwork.updateMany({
                where: { postId: post.id, connectionId: result.connectionId },
                data: {
                    status: result.success ? 'PUBLISHED' : 'FAILED',
                    providerPostId: result.providerPostId || null,
                    error: result.error || null,
                    publishedAt: result.success ? new Date() : null
                }
            })
        }

        const allFailed = results.every(r => !r.success)
        const anySuccess = results.some(r => r.success)

        // Clear mediaUrl from DB (file already deleted from storage)
        await (prisma as any).socialPost.update({
            where: { id: post.id },
            data: {
                status: allFailed ? 'FAILED' : anySuccess ? 'PUBLISHED' : 'PARTIAL',
                publishedAt: anySuccess ? new Date() : null,
                mediaUrl: null
            }
        })

        // Delete media file from Supabase storage
        await deleteMedia(mediaUrl)

        // Notify user of publish result
        const successNets = results.filter(r => r.success).map(r => r.network).join(', ')
        const failNets = results.filter(r => !r.success).map(r => r.network).join(', ')
        if (anySuccess) {
            await createNotification(
                user.id,
                '✅ Publicación exitosa',
                failNets
                    ? `Publicado en ${successNets}. Falló en: ${failNets}.`
                    : `Tu post fue publicado correctamente en ${successNets}.`,
                '/dashboard/services/social'
            )
        } else {
            await createNotification(
                user.id,
                '❌ Publicación fallida',
                `No se pudo publicar en ninguna red. Redes: ${failNets}. Revisa tus conexiones.`,
                '/dashboard/services/social'
            )
        }

        return NextResponse.json({ post, results })
    } catch (err: any) {
        console.error('[SocialPost]', err)
        return NextResponse.json({ error: err.message || 'Error al publicar' }, { status: 500 })
    }
}
