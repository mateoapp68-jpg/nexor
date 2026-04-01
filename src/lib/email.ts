import nodemailer from 'nodemailer'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://nexor-1.onrender.com'

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
})

function emailWrapper(content: string, accentColor = '#FFD700'): string {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NEXOR</title>
</head>
<body style="margin:0;padding:0;background-color:#07080F;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#07080F;padding:48px 16px;">
  <tr>
    <td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">

        <!-- LOGO -->
        <tr>
          <td align="center" style="padding-bottom:32px;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:linear-gradient(135deg,#FFD700 0%,#B45309 100%);border-radius:10px;padding:8px 18px;">
                  <span style="color:#000;font-size:15px;font-weight:900;letter-spacing:3px;">NEXOR</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- CARD -->
        <tr>
          <td style="background:#0D0F1E;border:1px solid rgba(255,255,255,0.07);border-radius:18px;overflow:hidden;">

            <!-- top line -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="height:1px;background:linear-gradient(90deg,transparent 0%,${accentColor} 50%,transparent 100%);"></td>
              </tr>
            </table>

            <!-- content -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:36px 32px;">
                  ${content}
                </td>
              </tr>
            </table>

            <!-- bottom line -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="height:1px;background:rgba(255,255,255,0.04);"></td>
              </tr>
            </table>

            <!-- card footer -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:14px 32px;">
                  <p style="color:rgba(255,255,255,0.18);font-size:11px;margin:0;letter-spacing:0.5px;">jdinternacional.com &nbsp;·&nbsp; soporte@jdinternacional.com</p>
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td align="center" style="padding-top:24px;">
            <p style="color:rgba(255,255,255,0.15);font-size:11px;margin:0;letter-spacing:0.5px;">
              © 2026 NEXOR. Todos los derechos reservados.
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>
  `.trim()
}

export async function sendWelcomeEmail(
  email: string,
  fullName: string,
  referralCode: string
): Promise<boolean> {
  const inviteLink = `${APP_URL}/register?ref=${referralCode}`

  const content = `
    <!-- label -->
    <p style="color:#FFD700;font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;margin:0 0 16px;">Cuenta creada exitosamente</p>

    <!-- heading -->
    <h1 style="color:#ffffff;font-size:22px;font-weight:800;margin:0 0 10px;letter-spacing:-0.3px;line-height:1.3;">
      Bienvenido, ${fullName}
    </h1>
    <p style="color:rgba(255,255,255,0.45);font-size:13px;margin:0 0 32px;line-height:1.8;">
      Ya formas parte de la red <span style="color:rgba(255,255,255,0.7);font-weight:600;">NEXOR</span>.
      Comparte tu código y empieza a construir tu negocio digital hoy mismo.
    </p>

    <!-- divider -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr><td style="height:1px;background:rgba(255,255,255,0.06);"></td></tr>
    </table>

    <!-- referral code -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      <tr>
        <td style="background:rgba(255,215,0,0.04);border:1px solid rgba(255,215,0,0.12);border-radius:12px;padding:20px 22px;">
          <p style="color:rgba(255,255,255,0.3);font-size:9px;font-weight:700;letter-spacing:3px;text-transform:uppercase;margin:0 0 8px;">Código de referido</p>
          <p style="color:#FFD700;font-size:26px;font-weight:900;letter-spacing:10px;margin:0;font-family:'Courier New',Courier,monospace;">${referralCode}</p>
        </td>
      </tr>
    </table>

    <!-- invite link -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
      <tr>
        <td style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:14px 18px;">
          <p style="color:rgba(255,255,255,0.25);font-size:9px;font-weight:600;letter-spacing:2px;text-transform:uppercase;margin:0 0 5px;">Enlace de invitación</p>
          <p style="color:rgba(0,255,136,0.7);font-size:11px;margin:0;word-break:break-all;font-family:'Courier New',Courier,monospace;">${inviteLink}</p>
        </td>
      </tr>
    </table>

    <!-- CTA -->
    <table cellpadding="0" cellspacing="0">
      <tr>
        <td style="border-radius:10px;background:linear-gradient(135deg,#FFD700 0%,#00FF88 100%);">
          <a href="${APP_URL}/dashboard"
             style="display:inline-block;color:#000000;text-decoration:none;font-weight:700;font-size:13px;padding:12px 30px;border-radius:10px;letter-spacing:0.5px;">
            Ir a mi panel &rarr;
          </a>
        </td>
      </tr>
    </table>
  `

  try {
    await transporter.sendMail({
      from: `"NEXOR" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: `Bienvenido a NEXOR, ${fullName}`,
      html: emailWrapper(content, '#FFD700'),
    })
    console.log(`[EMAIL] Welcome sent to ${email}`)
    return true
  } catch (err) {
    console.error('[EMAIL] Welcome error:', err)
    return false
  }
}

export interface OrderEmailItem {
  title: string
  quantity: number
  priceSnapshot: number
  selectedVariants: Record<string, string>
}

export async function sendOrderConfirmedEmail(
  email: string,
  fullName: string,
  order: {
    id: string
    totalPrice: number
    recipientName: string
    address: string
    city: string
    state: string
    country: string
    zipCode?: string | null
    createdAt: Date
    txHash?: string | null
    items: OrderEmailItem[]
  }
): Promise<boolean> {
  const orderId = order.id.slice(0, 8).toUpperCase()
  const dateStr = new Date(order.createdAt).toLocaleString('es-ES', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  const itemsRows = order.items.map(oi => {
    const variantsText = Object.entries(oi.selectedVariants).map(([k, v]) => `${k}: ${v}`).join(', ')
    const subtotal = (oi.priceSnapshot * oi.quantity).toFixed(2)
    return `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);color:rgba(255,255,255,0.8);font-size:13px;">
          ${oi.title}${variantsText ? `<br><span style="color:rgba(255,255,255,0.35);font-size:11px;">${variantsText}</span>` : ''}
        </td>
        <td style="padding:10px 8px;border-bottom:1px solid rgba(255,255,255,0.05);color:rgba(255,255,255,0.5);font-size:12px;text-align:center;">x${oi.quantity}</td>
        <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);color:#F5A623;font-size:13px;font-weight:700;text-align:right;">${subtotal} USDT</td>
      </tr>
    `
  }).join('')

  const content = `
    <!-- label -->
    <p style="color:#00FF88;font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;margin:0 0 16px;">✓ Pedido Confirmado</p>

    <!-- heading -->
    <h1 style="color:#ffffff;font-size:22px;font-weight:800;margin:0 0 6px;letter-spacing:-0.3px;line-height:1.3;">
      ¡Tu pedido fue aprobado!
    </h1>
    <p style="color:rgba(255,255,255,0.4);font-size:13px;margin:0 0 28px;line-height:1.7;">
      Hola <strong style="color:rgba(255,255,255,0.7);">${fullName}</strong>, tu compra en la Tienda Nexor ha sido confirmada.
    </p>

    <!-- order meta -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      <tr>
        <td style="background:rgba(0,255,136,0.04);border:1px solid rgba(0,255,136,0.12);border-radius:12px;padding:16px 20px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <p style="color:rgba(255,255,255,0.25);font-size:9px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;margin:0 0 4px;">Número de pedido</p>
                <p style="color:#00FF88;font-size:20px;font-weight:900;letter-spacing:5px;margin:0;font-family:'Courier New',Courier,monospace;">#${orderId}</p>
              </td>
              <td style="text-align:right;vertical-align:top;">
                <p style="color:rgba(255,255,255,0.25);font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 4px;">Fecha</p>
                <p style="color:rgba(255,255,255,0.55);font-size:12px;margin:0;">${dateStr}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- items table -->
    <p style="color:rgba(255,255,255,0.25);font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 10px;">Productos</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      ${itemsRows}
      <!-- total row -->
      <tr>
        <td colspan="2" style="padding:12px 0 0;color:rgba(255,255,255,0.35);font-size:12px;font-weight:600;">Total</td>
        <td style="padding:12px 0 0;text-align:right;font-weight:900;font-size:16px;color:#F5A623;">${order.totalPrice.toFixed(2)} USDT</td>
      </tr>
    </table>

    <!-- divider -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      <tr><td style="height:1px;background:rgba(255,255,255,0.06);"></td></tr>
    </table>

    <!-- delivery info -->
    <p style="color:rgba(255,255,255,0.25);font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 10px;">Datos de entrega</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:14px 18px;">
          <p style="color:rgba(255,255,255,0.7);font-size:13px;font-weight:700;margin:0 0 4px;">${order.recipientName}</p>
          <p style="color:rgba(255,255,255,0.35);font-size:12px;margin:0;line-height:1.6;">
            ${order.address}<br>
            ${order.city}, ${order.state}, ${order.country}${order.zipCode ? ` — CP ${order.zipCode}` : ''}
          </p>
        </td>
      </tr>
    </table>

    ${order.txHash ? `
    <!-- tx hash -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="background:rgba(255,215,0,0.03);border:1px solid rgba(255,215,0,0.1);border-radius:10px;padding:12px 16px;">
          <p style="color:rgba(255,255,255,0.25);font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 4px;">TX Hash (BSC)</p>
          <p style="color:rgba(255,215,0,0.6);font-size:10px;margin:0;word-break:break-all;font-family:'Courier New',Courier,monospace;">${order.txHash}</p>
        </td>
      </tr>
    </table>` : ''}

    <!-- CTA -->
    <table cellpadding="0" cellspacing="0">
      <tr>
        <td style="border-radius:10px;background:linear-gradient(135deg,#00FF88 0%,#FFD700 100%);">
          <a href="${APP_URL}/dashboard"
             style="display:inline-block;color:#000000;text-decoration:none;font-weight:700;font-size:13px;padding:12px 28px;border-radius:10px;letter-spacing:0.5px;">
            Ver mis pedidos &rarr;
          </a>
        </td>
      </tr>
    </table>
  `

  try {
    await transporter.sendMail({
      from: `"NEXOR" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: `✓ Pedido #${orderId} confirmado — Nexor`,
      html: emailWrapper(content, '#00FF88'),
    })
    console.log(`[EMAIL] Order confirmed sent to ${email} (order ${orderId})`)
    return true
  } catch (err) {
    console.error('[EMAIL] Order confirmed error:', err)
    return false
  }
}

export async function sendPlanPurchaseConfirmedEmail(
  email: string,
  fullName: string,
  purchase: {
    id: string
    plan: string
    price: number
    paymentMethod: string
    txHash?: string | null
    createdAt: Date
  }
): Promise<boolean> {
  const purchaseId = purchase.id.slice(0, 8).toUpperCase()
  const planLabel: Record<string, string> = { BASIC: 'Pack Básico', PRO: 'Pack Pro', ELITE: 'Pack Elite' }
  const planName = planLabel[purchase.plan] ?? purchase.plan
  const dateStr = new Date(purchase.createdAt).toLocaleString('es-ES', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  const content = `
    <!-- label -->
    <p style="color:#FFD700;font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;margin:0 0 16px;">✓ Plan Activado</p>

    <!-- heading -->
    <h1 style="color:#ffffff;font-size:22px;font-weight:800;margin:0 0 6px;letter-spacing:-0.3px;line-height:1.3;">
      ¡Tu plan fue activado!
    </h1>
    <p style="color:rgba(255,255,255,0.4);font-size:13px;margin:0 0 28px;line-height:1.7;">
      Hola <strong style="color:rgba(255,255,255,0.7);">${fullName}</strong>, tu compra de plan en Nexor ha sido confirmada y tu cuenta ha sido activada.
    </p>

    <!-- plan card -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      <tr>
        <td style="background:linear-gradient(135deg,rgba(255,215,0,0.07),rgba(0,255,136,0.04));border:1px solid rgba(255,215,0,0.2);border-radius:14px;padding:20px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <p style="color:rgba(255,255,255,0.3);font-size:9px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;margin:0 0 6px;">Plan adquirido</p>
                <p style="color:#FFD700;font-size:24px;font-weight:900;letter-spacing:2px;margin:0;">${planName.toUpperCase()}</p>
              </td>
              <td style="text-align:right;vertical-align:top;">
                <p style="color:rgba(255,255,255,0.25);font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 4px;">Total pagado</p>
                <p style="color:#F5A623;font-size:20px;font-weight:900;margin:0;">${purchase.price.toFixed(2)} <span style="font-size:12px;font-weight:600;color:rgba(245,166,35,0.7);">USDT</span></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- meta info -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      <tr>
        <td style="background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:14px 18px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding-bottom:8px;">
                <p style="color:rgba(255,255,255,0.25);font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 3px;">Número de solicitud</p>
                <p style="color:rgba(255,255,255,0.6);font-size:12px;font-family:'Courier New',Courier,monospace;margin:0;">#${purchaseId}</p>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:8px;border-top:1px solid rgba(255,255,255,0.05);padding-top:8px;">
                <p style="color:rgba(255,255,255,0.25);font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 3px;">Fecha de activación</p>
                <p style="color:rgba(255,255,255,0.6);font-size:12px;margin:0;">${dateStr}</p>
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid rgba(255,255,255,0.05);padding-top:8px;">
                <p style="color:rgba(255,255,255,0.25);font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 3px;">Validez</p>
                <p style="color:#00FF88;font-size:12px;font-weight:700;margin:0;">30 días desde la activación</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    ${purchase.txHash ? `
    <!-- tx hash -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="background:rgba(255,215,0,0.03);border:1px solid rgba(255,215,0,0.1);border-radius:10px;padding:12px 16px;">
          <p style="color:rgba(255,255,255,0.25);font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 4px;">TX Hash (BSC)</p>
          <p style="color:rgba(255,215,0,0.6);font-size:10px;margin:0;word-break:break-all;font-family:'Courier New',Courier,monospace;">${purchase.txHash}</p>
        </td>
      </tr>
    </table>` : ''}

    <!-- CTA -->
    <table cellpadding="0" cellspacing="0">
      <tr>
        <td style="border-radius:10px;background:linear-gradient(135deg,#FFD700 0%,#00FF88 100%);">
          <a href="${APP_URL}/dashboard"
             style="display:inline-block;color:#000000;text-decoration:none;font-weight:700;font-size:13px;padding:12px 28px;border-radius:10px;letter-spacing:0.5px;">
            Ir a mi panel &rarr;
          </a>
        </td>
      </tr>
    </table>
  `

  try {
    await transporter.sendMail({
      from: `"NEXOR" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: `✓ ${planName} activado — Nexor`,
      html: emailWrapper(content, '#FFD700'),
    })
    console.log(`[EMAIL] Plan confirmed sent to ${email} (${purchase.plan})`)
    return true
  } catch (err) {
    console.error('[EMAIL] Plan confirmed error:', err)
    return false
  }
}

export async function sendBotSaleReportEmail(
  ownerEmail: string,
  ownerName: string,
  botName: string,
  reportText: string,
): Promise<boolean> {
  const content = `
    <!-- label -->
    <p style="color:#00FF88;font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;margin:0 0 16px;">🤖 Bot Messenger — Nueva Venta</p>

    <h1 style="color:#ffffff;font-size:20px;font-weight:800;margin:0 0 6px;line-height:1.3;">
      Nuevo pedido confirmado
    </h1>
    <p style="color:rgba(255,255,255,0.4);font-size:13px;margin:0 0 24px;line-height:1.7;">
      Hola <strong style="color:rgba(255,255,255,0.7);">${ownerName}</strong>, tu bot
      <strong style="color:#FFD700;">${botName}</strong> acaba de cerrar una venta en Messenger.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="background:rgba(0,255,136,0.04);border:1px solid rgba(0,255,136,0.15);border-radius:12px;padding:20px 22px;">
          <p style="color:rgba(255,255,255,0.25);font-size:9px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;margin:0 0 10px;">Detalle del pedido</p>
          <p style="color:rgba(255,255,255,0.85);font-size:13px;line-height:1.8;margin:0;white-space:pre-wrap;">${reportText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
        </td>
      </tr>
    </table>

    <table cellpadding="0" cellspacing="0">
      <tr>
        <td style="border-radius:10px;background:linear-gradient(135deg,#FFD700 0%,#00FF88 100%);">
          <a href="${APP_URL}/dashboard/services/whatsapp"
             style="display:inline-block;color:#000000;text-decoration:none;font-weight:700;font-size:13px;padding:12px 28px;border-radius:10px;letter-spacing:0.5px;">
            Ver en el panel &rarr;
          </a>
        </td>
      </tr>
    </table>
  `

  try {
    await transporter.sendMail({
      from: `"NEXOR" <${process.env.GMAIL_USER}>`,
      to: ownerEmail,
      subject: `🤖 Nueva venta — Bot ${botName} (Messenger)`,
      html: emailWrapper(content, '#00FF88'),
    })
    console.log(`[EMAIL] Bot sale report sent to ${ownerEmail} (bot: ${botName})`)
    return true
  } catch (err) {
    console.error('[EMAIL] Bot sale report error:', err)
    return false
  }
}

export async function sendPasswordResetEmail(
  email: string,
  token: string
): Promise<boolean> {
  const resetLink = `${APP_URL}/reset-password?token=${token}`

  const content = `
    <!-- label -->
    <p style="color:#B45309;font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;margin:0 0 16px;">Seguridad de cuenta</p>

    <!-- heading -->
    <h1 style="color:#ffffff;font-size:22px;font-weight:800;margin:0 0 10px;letter-spacing:-0.3px;line-height:1.3;">
      Restablecer contraseña
    </h1>
    <p style="color:rgba(255,255,255,0.45);font-size:13px;margin:0 0 32px;line-height:1.8;">
      Recibimos una solicitud para restablecer la contraseña de tu cuenta en
      <span style="color:rgba(255,255,255,0.7);font-weight:600;">NEXOR</span>.
      Si no fuiste tú, puedes ignorar este correo.
    </p>

    <!-- divider -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr><td style="height:1px;background:rgba(255,255,255,0.06);"></td></tr>
    </table>

    <!-- CTA -->
    <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="border-radius:10px;background:linear-gradient(135deg,#7B00EF 0%,#FFD700 100%);">
          <a href="${resetLink}"
             style="display:inline-block;color:#ffffff;text-decoration:none;font-weight:700;font-size:13px;padding:12px 30px;border-radius:10px;letter-spacing:0.5px;">
            Restablecer contraseña &rarr;
          </a>
        </td>
      </tr>
    </table>

    <!-- link box -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      <tr>
        <td style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:14px 18px;">
          <p style="color:rgba(255,255,255,0.25);font-size:9px;font-weight:600;letter-spacing:2px;text-transform:uppercase;margin:0 0 5px;">O copia este enlace</p>
          <p style="color:rgba(155,0,255,0.65);font-size:11px;margin:0;word-break:break-all;font-family:'Courier New',Courier,monospace;">${resetLink}</p>
        </td>
      </tr>
    </table>

    <!-- warning -->
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="background:rgba(255,180,0,0.03);border:1px solid rgba(255,180,0,0.1);border-radius:9px;padding:12px 16px;">
          <p style="color:rgba(255,180,0,0.55);font-size:11px;margin:0;line-height:1.6;">
            Este enlace expira en <strong style="color:rgba(255,180,0,0.75);">1 hora</strong>. Si no solicitaste esto, tu cuenta sigue segura.
          </p>
        </td>
      </tr>
    </table>
  `

  try {
    await transporter.sendMail({
      from: `"NEXOR" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: 'Restablecer contraseña — NEXOR',
      html: emailWrapper(content, '#B45309'),
    })
    console.log(`[EMAIL] Reset sent to ${email}`)
    return true
  } catch (err) {
    console.error('[EMAIL] Reset error:', err)
    return false
  }
}

export async function sendDeviceVerificationEmail(
  email: string,
  fullName: string,
  code: string
): Promise<boolean> {
  const content = `
    <p style="color:#F59E0B;font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;margin:0 0 16px;">Verificación de dispositivo</p>

    <h1 style="color:#ffffff;font-size:22px;font-weight:800;margin:0 0 10px;letter-spacing:-0.3px;line-height:1.3;">
      Nuevo dispositivo detectado
    </h1>
    <p style="color:rgba(255,255,255,0.45);font-size:13px;margin:0 0 28px;line-height:1.8;">
      Hola <span style="color:rgba(255,255,255,0.7);font-weight:600;">${fullName}</span>, detectamos un intento de inicio de sesión desde un dispositivo no reconocido. Ingresa el código de verificación para continuar.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr>
        <td align="center" style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.2);border-radius:14px;padding:28px 24px;">
          <p style="color:rgba(255,255,255,0.4);font-size:11px;letter-spacing:2px;text-transform:uppercase;margin:0 0 12px;">Tu código de verificación</p>
          <p style="color:#F59E0B;font-size:40px;font-weight:900;letter-spacing:10px;margin:0;font-family:monospace;">${code}</p>
          <p style="color:rgba(255,255,255,0.25);font-size:11px;margin:12px 0 0;">Válido por 10 minutos</p>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:0;">
      <tr>
        <td style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:14px 18px;">
          <p style="color:rgba(255,255,255,0.35);font-size:12px;margin:0;line-height:1.7;">
            Si no intentaste iniciar sesión, ignora este correo. Tu cuenta permanece segura.
          </p>
        </td>
      </tr>
    </table>
  `

  try {
    await transporter.sendMail({
      from: `"NEXOR" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: 'Código de verificación de dispositivo — NEXOR',
      html: emailWrapper(content, '#F59E0B'),
    })
    console.log(`[EMAIL] Device verification sent to ${email}`)
    return true
  } catch (err) {
    console.error('[EMAIL] Device verification error:', err)
    return false
  }
}

export async function sendAdminOtpEmail(
  email: string,
  fullName: string,
  code: string
): Promise<boolean> {
  const content = `
    <p style="color:#EF4444;font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;margin:0 0 16px;">Acceso al panel admin</p>

    <h1 style="color:#ffffff;font-size:22px;font-weight:800;margin:0 0 10px;letter-spacing:-0.3px;line-height:1.3;">
      Código de acceso admin
    </h1>
    <p style="color:rgba(255,255,255,0.45);font-size:13px;margin:0 0 28px;line-height:1.8;">
      Hola <span style="color:rgba(255,255,255,0.7);font-weight:600;">${fullName}</span>, se solicitó acceso al panel de administración. Usa este código para continuar.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr>
        <td align="center" style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);border-radius:14px;padding:28px 24px;">
          <p style="color:rgba(255,255,255,0.4);font-size:11px;letter-spacing:2px;text-transform:uppercase;margin:0 0 12px;">Tu código de acceso</p>
          <p style="color:#EF4444;font-size:40px;font-weight:900;letter-spacing:10px;margin:0;font-family:monospace;">${code}</p>
          <p style="color:rgba(255,255,255,0.25);font-size:11px;margin:12px 0 0;">Válido por 15 minutos · Sesión de 4 horas</p>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:14px 18px;">
          <p style="color:rgba(255,255,255,0.35);font-size:12px;margin:0;line-height:1.7;">
            Si no solicitaste este acceso, alguien puede estar intentando entrar al panel. Cambia tu contraseña inmediatamente.
          </p>
        </td>
      </tr>
    </table>
  `

  try {
    await transporter.sendMail({
      from: `"NEXOR" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: '🔐 Código de acceso admin — NEXOR',
      html: emailWrapper(content, '#EF4444'),
    })
    console.log(`[EMAIL] Admin OTP sent to ${email}`)
    return true
  } catch (err) {
    console.error('[EMAIL] Admin OTP error:', err)
    return false
  }
}
