export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { supabaseAdmin } from '@/lib/supabase'

const BUCKET = 'template-media'

const ALLOWED: Record<string, string> = {
  'image/jpeg':       'IMAGE',
  'image/jpg':        'IMAGE',
  'image/png':        'IMAGE',
  'image/webp':       'IMAGE',
  'video/mp4':        'VIDEO',
  'video/quicktime':  'VIDEO',
  'video/3gpp':       'VIDEO',
  'application/pdf':  'DOCUMENT',
}

const MAX_SIZE: Record<string, number> = {
  IMAGE:    5  * 1024 * 1024,  // 5 MB
  VIDEO:    16 * 1024 * 1024,  // 16 MB
  DOCUMENT: 100 * 1024 * 1024, // 100 MB
}

export async function POST(req: NextRequest, { params }: { params: { botId: string } }) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Verify bot belongs to user
  const bot = await prisma.bot.findFirst({
    where: { id: params.botId, userId: user.id },
  })
  if (!bot) return NextResponse.json({ error: 'Bot no encontrado' }, { status: 404 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Archivo requerido' }, { status: 400 })

  const mediaType = ALLOWED[file.type]
  if (!mediaType) {
    return NextResponse.json({
      error: 'Tipo de archivo no permitido. Imágenes: JPG, PNG, WEBP · Video: MP4 · Documento: PDF',
    }, { status: 400 })
  }

  if (file.size > MAX_SIZE[mediaType]) {
    const maxMb = MAX_SIZE[mediaType] / 1024 / 1024
    return NextResponse.json({ error: `El archivo excede el límite de ${maxMb} MB` }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const ext    = file.name.split('.').pop()?.toLowerCase() || file.type.split('/')[1]
  const path   = `${user.id}/${params.botId}/${Date.now()}.${ext}`

  // Try upload; create bucket if missing
  let { error: uploadErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false })

  if (uploadErr) {
    await supabaseAdmin.storage.createBucket(BUCKET, { public: true }).catch(() => {})
    const retry = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: file.type, upsert: false })
    if (retry.error) {
      return NextResponse.json({ error: retry.error.message }, { status: 500 })
    }
  }

  const { data: urlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path)

  return NextResponse.json({ url: urlData.publicUrl, type: mediaType })
}
