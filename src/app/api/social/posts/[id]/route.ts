export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { supabaseAdmin } from '@/lib/supabase'

const BUCKET = 'social-media'

async function deleteMedia(mediaUrl: string | null) {
    if (!mediaUrl) return
    const marker = `/object/public/${BUCKET}/`
    const idx = mediaUrl.indexOf(marker)
    if (idx === -1) return
    const path = mediaUrl.slice(idx + marker.length).split('?')[0]
    try { await supabaseAdmin.storage.from(BUCKET).remove([path]) } catch {}
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
    try {
        const user = await getAuthUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const post = await (prisma as any).socialPost.findFirst({
            where: { id: params.id, userId: user.id }
        })
        if (!post) return NextResponse.json({ error: 'Post no encontrado' }, { status: 404 })

        await deleteMedia(post.mediaUrl)
        await (prisma as any).socialPost.delete({ where: { id: params.id } })

        return NextResponse.json({ success: true })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
