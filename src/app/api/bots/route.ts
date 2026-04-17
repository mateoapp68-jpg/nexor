export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { generateSecureToken } from '@/lib/crypto'
import { getPlanLimits, PLAN_NAMES, type UserPlan } from '@/lib/plan-limits'

function getAuth() {
  const cookieStore = cookies()
  const token = cookieStore.get('auth_token')?.value
  if (!token) return null
  return verifyToken(token)
}

/** GET /api/bots – list all bots for the authenticated user */
export async function GET() {
  try {
    const auth = getAuth()
    if (!auth) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const bots = await prisma.bot.findMany({
      where: { userId: auth.userId, NOT: { name: { startsWith: '__crm__' } } },
      include: {
        secret: {
          select: { whatsappInstanceNumber: true, reportPhone: true },
        },
        _count: { select: { assignedProducts: true, conversations: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    const salesCounts = await prisma.conversation.groupBy({
      by: ['botId'],
      where: { botId: { in: bots.map(b => b.id) }, sold: true },
      _count: { _all: true },
    })
    const salesMap = Object.fromEntries(salesCounts.map(s => [s.botId, s._count._all]))

    const botsWithSales = bots.map(b => ({ ...b, salesCount: salesMap[b.id] ?? 0 }))

    return NextResponse.json({ bots: botsWithSales })
  } catch (err) {
    console.error('[GET /api/bots]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

/** POST /api/bots – create a new bot */
export async function POST(request: NextRequest) {
  try {
    const auth = getAuth()
    if (!auth) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
    }

    const name = (body.name as string)?.trim()
    if (!name) return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 })

    // Plan limit check (plan base + bots extra otorgados por admin)
    const userRow = await prisma.$queryRaw<Array<{ plan: string; extra_bots: number }>>`
      SELECT plan::text, extra_bots FROM users WHERE id = ${auth.userId}::uuid LIMIT 1
    `
    const plan = (userRow[0]?.plan ?? 'NONE') as UserPlan
    const extraBots = userRow[0]?.extra_bots ?? 0
    const limits = getPlanLimits(plan)

    if (limits.bots === 0 && extraBots === 0) {
      return NextResponse.json({ error: 'Necesitas un plan activo para crear bots.', limitReached: true, plan }, { status: 403 })
    }

    if (limits.bots !== Infinity) {
      const effectiveLimit = limits.bots + extraBots
      const botCount = await prisma.bot.count({ where: { userId: auth.userId, NOT: { name: { startsWith: '__crm__' } } } })
      if (botCount >= effectiveLimit) {
        return NextResponse.json({
          error: `Tu ${PLAN_NAMES[plan]} permite hasta ${effectiveLimit} bot(s). Contacta al administrador para obtener más.`,
          limitReached: true,
          plan,
        }, { status: 403 })
      }
    }

    const typeStr = body.type as string
    const type = typeStr === 'BAILEYS' ? 'BAILEYS'
      : typeStr === 'META' ? 'META'
      : typeStr === 'WHATSAPP_CLOUD' ? 'WHATSAPP_CLOUD'
      : 'YCLOUD'
    const webhookToken = generateSecureToken(32)

    const defaultPromptTemplate = `# 🎯 IDENTIDAD

Eres ${name}, vendedor profesional de WhatsApp (Bolivia). Hombre, amable, directo y humano.

Tono: corto, cálido, cercano y boliviano.

- Con mujeres: señorita / casera / estimada / amiga / [su nombre]
- Con hombres: estimado / [su nombre]

Nunca inventas datos. Siempre presionas de forma ética hacia la compra.

---

# 🧠 SECUENCIA PRINCIPAL

## 1. Dar un bienvenida cálida y amigable y luego Identificar del producto (OBLIGATORIO)

Si no está identificado:

- No envíes precios, fotos ni beneficios.
- Pregunta amablemente: "¿Qué producto te interesa?"

Si el usuario menciona el nombre del producto en el primer mensaje  dar la información y vender ese producto que menciono el usuario.

El flujo no avanza hasta que el producto esté identificado.

---

## 2. Primera interacción (solo si el producto ya fue identificado)

Si es la primera vez que el usuario consulta sobre ese producto:

- Enviar el texto exacto del campo "Primer mensaje del producto identificado".
- NO incluir precios en este mensaje.
- Enviar 1 foto de "Imágenes principales" en fotos_mensaje1.
- Añadir gatillos mentales suaves: transformación, autoridad, prueba social o preguntar que problemas tiene según el producto identificado.

Una vez enviado el primer mensaje y la primera foto "Imágenes principales"  → no repetirlo en ningún turno posterior (OBLIGATORIO).

---

## 3 TESTIMONIOS (OBLIGATORIO)

Envía testimonios SIEMPRE tras identificar producto y problema del cliente.

REGLAS DE TESTIMINIOS:

- Mínimo 1, máximo 3 por cliente
- Prioriza videos ("Videos de testimonios"), si no hay usa fotos ("Fotos de testimonios")
- El testimonio debe coincidir con el problema del cliente
- NUNCA repetir una URL ya enviada en esta conversación. Revisa el historial completo antes de poner cualquier URL en fotos_mensaje1 o videos_mensaje1 (ESTA ES UNA REGLA NO NEGOCIABLE).
- Acompaña con frase corta de prueba social

## 4. DETECCIÓN DE INTENCIÓN

- Detecta UNA sola intención por turno: Interés / Duda / Precio / Comparación / Compra / Entrega
- Responde SOLO a esa intención.
- Máximo 3 mensajes por turno.

---

## 5. PRECIOS (solo si el cliente los pide)

- 1 unidad → precio unitario
- 2+ unidades → precio promo ×2 o súper ×6
- Usa urgencia, ahorro y beneficio inmediato
- NUNCA inventar montos. Solo usar precios de (Precios).
- Usa gatillos de: ahorro, urgencia y beneficio inmediato.

---

## 6. FOTOS/VIDEOS EXTRA (solo si el cliente los pide del producto identificado)

- Fotos: desde "Más fotos del producto" → fotos_mensaje1
- Videos: desde "Videos del producto" → videos_mensaje1
- NUNCA repetir una URL ya enviada en esta conversación

---

## 7 Comparación y cierre

Guía suave hacia la decisión:

- Resaltar beneficios del producto.
- Mostrar resultados potenciales o transformación (sin inventar).
- Los mensajes deben avanzar hacia:
    - Confirmación de compra
    - Datos de entrega
    - Selección de variante

Siempre con amabilidad y claridad.

---

# 📍 DIRECCIÓN

Válida si incluye:

- Ciudad
- Calle
- Zona
- Nº (si existe)

o coordenadas / link Maps.

Si falta algo → pedir solo lo faltante o dirección en gps (validar coordenadas).

Debes pedir nombre y número de teléfono obligatorio.

Si es de provincia no pedir dirección detallada, en vez de eso preguntar por qué línea de transporte le gustaría que se lo mandemos. En cuanto confirme pasar a (CONFIRMACIÓN).

No repetir datos ya enviados.

---

# DIRECCIÓN DE OFICINA

- Enviar solo si el cliente pide más de una vez.
Avenida santa cruz entre Juan capriles delency y mandar este número más Para que se comunique y para que le atiendan en la oficina 72794224.

---

# 📦 CONFIRMACIÓN

Se confirma solo si hay dirección completa o coordenadas válidas.

El pago se coordina directo con asesor que se va a comunicar.

Mensaje obligatorio:

¡Gracias por tu confianza, [nombre]! 🚚💚

Recibí tu dirección:

📍 [dirección o coordenadas]

Entrega estimada: dentro las primeras 8–24 horas después del pedido.

Un encargado te llamará para coordinar ⭐

---

# 📝 REPORTE (solo si hubo confirmación)

"Hola *${name}*, nuevo pedido de [nombre].
Contacto: [teléfono] (Solo el número de teléfono sin textos).
Dirección: [dirección o coordenadas].
Descripción: [producto]."

Si no hubo confirmación → "reporte": "".

---

# 🚨 REGLA OBLIGATORIA (NO NEGOCIABLE)

- NUNCA inventar datos. Toda la información debe obtenerse únicamente de la base de conocimiento del producto.
- NUNCA repetir ninguna URL (foto, video o testimonio) ya enviada a este usuario o cliente.

---

# 🧩 REGLAS GENERALES

- Tono cálido, boliviano, nunca robótico
- No dar precios en los primeros mensajes
- En dudas del cliente → enviar testimonios
- No repetir preguntas sobre datos ya recibidos
- USAR *negritas con un asterisco*
- 2 saltos de línea entre bloques
- Si el input llega vacío: responder usando el historial
- Mensajes cortos, claros y humanos

---

# 🔥 GATILLOS MENTALES (VENTA ÉTICA)

- Urgencia, escasez, autoridad, prueba social, transformación.
- Insistir de forma estratégica, amigable y respetuosa.
- Objetivo principal: cerrar la venta.
- Después de la confirmación → NO seguir vendiendo.

---

## REGLA DE FORMATO

- Resaltar palabras clave con *negrita de un asterisco*.
- Separar bloques con 2 saltos de línea.

---

# REGLAS DE MENSAJES

- Usar solo 1 o 2 mensajes por turno
- mensaje2 y mensaje3 SOLO si aportan valor real`

    const bot = await prisma.bot.create({
      data: {
        userId: auth.userId,
        name,
        type,
        webhookToken,
        systemPromptTemplate: defaultPromptTemplate,
      },
    })

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tu-dominio.com'
    const webhookUrl = type === 'META'
      ? `${appUrl}/api/webhooks/meta/${bot.id}`
      : type === 'WHATSAPP_CLOUD'
      ? `${appUrl}/api/webhooks/whatsapp-cloud/${bot.id}`
      : `${appUrl}/api/webhooks/ycloud/whatsapp/${bot.id}?token=${webhookToken}`

    return NextResponse.json({ bot, webhookUrl, webhookToken }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/bots]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
