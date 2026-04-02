export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { supabaseAdmin } from '@/lib/supabase'

const BUCKET = 'broadcast-images'

const ALLOWED_TYPES: Record<string, string> = {
    'image/jpeg': 'IMAGE',
    'image/png': 'IMAGE',
    'image/webp': 'IMAGE',
    'image/gif': 'IMAGE',
    'video/mp4': 'VIDEO',
    'video/quicktime': 'VIDEO',
    'video/webm': 'VIDEO',
    'video/3gpp': 'VIDEO',
}

const MAX_IMAGE_SIZE = 5 * 1024 * 1024   // 5 MB
const MAX_VIDEO_SIZE = 64 * 1024 * 1024  // 64 MB

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const campaign = await (prisma as any).broadcastCampaign.findFirst({
        where: { id: params.id, userId: user.id },
        include: { images: true },
    })
    if (!campaign) return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 })

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Archivo requerido' }, { status: 400 })

    const mediaType = ALLOWED_TYPES[file.type]
    if (!mediaType) {
        return NextResponse.json({ error: 'Solo se permiten imágenes (JPG, PNG, WEBP, GIF) o videos (MP4, MOV, WEBM, 3GP)' }, { status: 400 })
    }

    const maxSize = mediaType === 'VIDEO' ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE
    if (file.size > maxSize) {
        return NextResponse.json({
            error: mediaType === 'VIDEO'
                ? 'El video no puede superar 64 MB'
                : 'La imagen no puede superar 5 MB',
        }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const ext = file.name.split('.').pop() || file.type.split('/')[1]
    const path = `${user.id}/${params.id}/${Date.now()}.${ext}`

    const { error: uploadErr } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(path, buffer, { contentType: file.type, upsert: false })

    if (uploadErr) {
        // Try creating bucket if not exists
        await supabaseAdmin.storage.createBucket(BUCKET, { public: true }).catch(() => {})
        const { error: retry } = await supabaseAdmin.storage
            .from(BUCKET)
            .upload(path, buffer, { contentType: file.type, upsert: false })
        if (retry) return NextResponse.json({ error: retry.message }, { status: 500 })
    }

    const { data: urlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path)

    const image = await (prisma as any).broadcastImage.create({
        data: {
            campaignId: params.id,
            url: urlData.publicUrl,
            type: mediaType,
            order: campaign.images.length,
        },
    })

    return NextResponse.json({ image }, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { imageId } = await req.json()

    const image = await (prisma as any).broadcastImage.findFirst({
        where: { id: imageId, campaign: { userId: user.id, id: params.id } },
    })
    if (!image) return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 })

    await (prisma as any).broadcastImage.delete({ where: { id: imageId } })
    return NextResponse.json({ ok: true })
}
