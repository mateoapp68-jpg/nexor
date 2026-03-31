export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { supabaseAdmin } from '@/lib/supabase'

const BUCKET = 'broadcast-images'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const campaign = await (prisma as any).broadcastCampaign.findFirst({
        where: { id: params.id, userId: user.id },
        include: { images: true },
    })
    if (!campaign) return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 })
    if (campaign.images.length >= 5) {
        return NextResponse.json({ error: 'Máximo 5 imágenes por campaña' }, { status: 400 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Archivo requerido' }, { status: 400 })

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowedTypes.includes(file.type)) {
        return NextResponse.json({ error: 'Solo se permiten imágenes JPG, PNG, WEBP o GIF' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const ext = file.type.split('/')[1]
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
    if (!image) return NextResponse.json({ error: 'Imagen no encontrada' }, { status: 404 })

    await (prisma as any).broadcastImage.delete({ where: { id: imageId } })
    return NextResponse.json({ ok: true })
}
