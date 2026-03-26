export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

const BUCKET = 'social-media'

export async function POST(req: Request) {
    try {
        const user = await getAuthUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const formData = await req.formData()
        const file = formData.get('file') as File | null
        if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })

        // Validate file size (max 100 MB)
        if (file.size > 100 * 1024 * 1024) {
            return NextResponse.json({ error: 'El archivo no puede superar los 100 MB' }, { status: 400 })
        }
        // Validate MIME type server-side
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
            return NextResponse.json({ error: 'Solo se permiten imágenes y videos' }, { status: 400 })
        }

        // Ensure bucket exists
        const { data: buckets } = await supabaseAdmin.storage.listBuckets()
        if (!buckets?.some(b => b.name === BUCKET)) {
            await supabaseAdmin.storage.createBucket(BUCKET, { public: true })
        }

        const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
        const path = `posts/${user.id}/${Date.now()}.${ext}`
        const buffer = Buffer.from(await file.arrayBuffer())

        const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, buffer, {
            contentType: file.type,
            upsert: true
        })
        if (error) throw new Error(error.message)

        const { data: urlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path)
        const mediaType = file.type.startsWith('video') ? 'video' : 'image'

        return NextResponse.json({ mediaUrl: urlData.publicUrl, mediaType })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
