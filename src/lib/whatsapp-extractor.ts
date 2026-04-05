/**
 * WhatsApp Extractor — Extracción de grupos, etiquetas y contactos desde Baileys
 * con resolución de LIDs a teléfonos reales.
 *
 * REGLA CRÍTICA: Solo se exportan contactos con teléfono REAL resuelto.
 * Los LIDs no resueltos se omiten completamente (no aparecen en el Excel).
 */

import { prisma } from '@/lib/prisma'
import { BaileysManager } from '@/lib/baileys-manager'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExtractorGroup {
    id: string
    name: string
    totalMembers: number
    resolvedMembers: number
}

export interface ExtractorLabel {
    id: string
    name: string
    color: number
    totalContacts: number
    resolvedContacts: number
}

export interface ExtractorContact {
    phone: string
    name: string | null
    source: string
}

// ─── LID Persistence ──────────────────────────────────────────────────────────

/**
 * Guarda un mapping LID→Phone en la DB (upsert).
 * Se llama desde los listeners de Baileys cada vez que llega info nueva.
 */
export async function persistLidMapping(
    botId: string,
    lid: string,
    phone: string,
    name: string | null,
    source: string,
): Promise<void> {
    if (!lid || !phone) return
    const cleanPhone = phone.replace(/\D/g, '')
    if (!cleanPhone || cleanPhone.length < 8) return

    try {
        await (prisma as any).whatsAppLidMap.upsert({
            where: { botId_lid: { botId, lid } },
            create: {
                botId,
                lid,
                phone: cleanPhone,
                name: name?.trim() || null,
                source,
            },
            update: {
                phone: cleanPhone,
                name: name?.trim() || undefined,
                source,
            },
        })
    } catch {
        // silent — DB errors during live events shouldn't crash the bot
    }
}

/**
 * Busca un teléfono en la DB por su LID.
 */
async function lookupLidInDb(botId: string, lid: string): Promise<{ phone: string; name: string | null } | null> {
    try {
        const row = await (prisma as any).whatsAppLidMap.findUnique({
            where: { botId_lid: { botId, lid } },
        })
        if (row) return { phone: row.phone, name: row.name }
    } catch { }
    return null
}

// ─── Phone Resolution ─────────────────────────────────────────────────────────

/**
 * Resuelve un ID de WhatsApp (JID o LID) a teléfono real.
 * Retorna null si NO se puede resolver — NUNCA devuelve basura.
 */
export async function resolveToRealPhone(
    botId: string,
    id: any,
): Promise<{ phone: string; name: string | null } | null> {
    if (!id) return null

    // Extract serialized form
    let serialized: string
    if (typeof id === 'string') {
        serialized = id
    } else if (id._serialized) {
        serialized = id._serialized
    } else if (id.user) {
        serialized = `${id.user}@${id.server || 's.whatsapp.net'}`
    } else {
        return null
    }

    // Case 1: Already a phone JID
    if (serialized.endsWith('@s.whatsapp.net')) {
        const match = serialized.match(/^(\d+)/)
        if (match && match[1].length >= 8) {
            return { phone: `+${match[1]}`, name: null }
        }
        return null
    }

    // Case 2: LID — need resolution
    if (serialized.endsWith('@lid')) {
        // Try 1: DB lookup (persistent mapping)
        const fromDb = await lookupLidInDb(botId, serialized)
        if (fromDb) return { phone: `+${fromDb.phone}`, name: fromDb.name }

        // Try 2: also look up by full serialized form stored differently
        const lidUser = serialized.replace('@lid', '')
        const fromDb2 = await lookupLidInDb(botId, lidUser)
        if (fromDb2) return { phone: `+${fromDb2.phone}`, name: fromDb2.name }

        // Try 3: Baileys in-memory lidMapping
        try {
            const conn = (BaileysManager as any)
            const status = conn.getStatus(botId)
            if (status.status === 'connected') {
                // Access internal connection map via private accessor
                const sock = (conn as any).connections?.get?.(botId)?.sock
                if (sock?.signalRepository?.lidMapping?.getPNForLID) {
                    const pn = await sock.signalRepository.lidMapping.getPNForLID(serialized)
                    if (pn) {
                        const match = String(pn).match(/^(\d+)/)
                        if (match && match[1].length >= 8) {
                            // Cache in DB for next time
                            await persistLidMapping(botId, serialized, match[1], null, 'signal').catch(() => { })
                            return { phone: `+${match[1]}`, name: null }
                        }
                    }
                }
            }
        } catch { }
    }

    return null // NO resolution possible — don't return garbage
}

// ─── Group Extraction ─────────────────────────────────────────────────────────

/**
 * Lista todos los grupos del bot con conteo de miembros resueltos vs totales.
 */
export async function listGroups(botId: string): Promise<{ success: boolean; groups?: ExtractorGroup[]; error?: string }> {
    const status = BaileysManager.getStatus(botId)
    if (status.status !== 'connected') {
        return { success: false, error: 'El bot no está conectado' }
    }

    const sock = getSock(botId)
    if (!sock) return { success: false, error: 'Bot no disponible' }

    try {
        const groupsMap = await (sock as any).groupFetchAllParticipating()
        const groupIds = Object.keys(groupsMap || {})
        const result: ExtractorGroup[] = []

        for (const gid of groupIds) {
            const g = groupsMap[gid]
            if (!g) continue

            const participants = g.participants || []
            const total = participants.length
            let resolved = 0

            // Count resolved participants (without actually building the list)
            for (const p of participants) {
                const phone = await resolveToRealPhone(botId, p.id)
                if (phone) resolved++
            }

            result.push({
                id: g.id,
                name: g.subject || 'Sin nombre',
                totalMembers: total,
                resolvedMembers: resolved,
            })
        }

        result.sort((a, b) => a.name.localeCompare(b.name))
        return { success: true, groups: result }
    } catch (err: any) {
        console.error('[EXTRACTOR] listGroups error:', err)
        return { success: false, error: err.message || 'Error al listar grupos' }
    }
}

/**
 * Obtiene los contactos de grupos específicos con teléfonos REALES.
 * Los LIDs no resueltos se omiten.
 */
export async function getGroupContacts(
    botId: string,
    groupIds: string[],
): Promise<{ success: boolean; contacts?: ExtractorContact[]; error?: string }> {
    const sock = getSock(botId)
    if (!sock) return { success: false, error: 'Bot no conectado' }

    try {
        const allContacts: ExtractorContact[] = []
        const seen = new Set<string>()

        for (const groupId of groupIds) {
            const metadata = await (sock as any).groupMetadata(groupId).catch(() => null)
            if (!metadata) continue

            const groupName = metadata.subject || 'Grupo'
            const participants = metadata.participants || []

            for (const p of participants) {
                const resolved = await resolveToRealPhone(botId, p.id)
                if (!resolved) continue // ⚠️ Solo teléfonos reales
                const key = `${groupId}:${resolved.phone}`
                if (seen.has(key)) continue
                seen.add(key)
                allContacts.push({
                    phone: resolved.phone,
                    name: resolved.name,
                    source: `Grupo: ${groupName}`,
                })
            }
        }

        return { success: true, contacts: allContacts }
    } catch (err: any) {
        console.error('[EXTRACTOR] getGroupContacts error:', err)
        return { success: false, error: err.message || 'Error al extraer contactos' }
    }
}

// ─── Label Extraction ─────────────────────────────────────────────────────────

/**
 * Lista las etiquetas del bot (solo WhatsApp Business).
 */
export async function listLabels(botId: string): Promise<{ success: boolean; labels?: ExtractorLabel[]; error?: string }> {
    const labels = BaileysManager.getLabels(botId)
    if (labels.length === 0) {
        return { success: false, error: 'No se encontraron etiquetas. Solo funciona con WhatsApp Business con etiquetas creadas.' }
    }

    try {
        const result: ExtractorLabel[] = []
        for (const label of labels) {
            const chatIds = (BaileysManager as any).getLabelContactsRaw?.(botId, label.id) || []
            // We don't have raw method — compute resolved count directly
            const conn = (BaileysManager as any).getConnection?.(botId)
            const labelChats = conn?.labelChats || []
            const chatIdsForLabel = labelChats.filter((a: any) => a.labelId === label.id).map((a: any) => a.chatId)

            let resolved = 0
            for (const cid of chatIdsForLabel) {
                const r = await resolveToRealPhone(botId, cid)
                if (r) resolved++
            }

            result.push({
                id: label.id,
                name: label.name,
                color: label.color,
                totalContacts: chatIdsForLabel.length,
                resolvedContacts: resolved,
            })
        }
        return { success: true, labels: result }
    } catch (err: any) {
        console.error('[EXTRACTOR] listLabels error:', err)
        return { success: false, error: err.message || 'Error al listar etiquetas' }
    }
}

/**
 * Obtiene los contactos de etiquetas específicas con teléfonos REALES.
 */
export async function getLabelContacts(
    botId: string,
    labelIds: string[],
): Promise<{ success: boolean; contacts?: ExtractorContact[]; error?: string }> {
    try {
        const labels = BaileysManager.getLabels(botId)
        const labelNameById = new Map(labels.map(l => [l.id, l.name]))
        const conn = (BaileysManager as any).getConnection?.(botId)
        const labelChats = conn?.labelChats || []

        const allContacts: ExtractorContact[] = []
        const seen = new Set<string>()

        for (const labelId of labelIds) {
            const labelName = labelNameById.get(labelId) || 'Etiqueta'
            const chatIds = labelChats.filter((a: any) => a.labelId === labelId).map((a: any) => a.chatId)

            for (const cid of chatIds) {
                const resolved = await resolveToRealPhone(botId, cid)
                if (!resolved) continue // ⚠️ Solo teléfonos reales
                const key = `${labelId}:${resolved.phone}`
                if (seen.has(key)) continue
                seen.add(key)
                allContacts.push({
                    phone: resolved.phone,
                    name: resolved.name,
                    source: `Etiqueta: ${labelName}`,
                })
            }
        }

        return { success: true, contacts: allContacts }
    } catch (err: any) {
        console.error('[EXTRACTOR] getLabelContacts error:', err)
        return { success: false, error: err.message || 'Error al extraer contactos' }
    }
}

// ─── All Chats ────────────────────────────────────────────────────────────────

/**
 * Obtiene todos los contactos (no grupos) del bot desde la tabla Conversation.
 * Estos siempre tienen teléfono real porque vienen de mensajes recibidos.
 */
export async function getAllChats(botId: string): Promise<{ success: boolean; contacts?: ExtractorContact[]; error?: string }> {
    try {
        const conversations = await prisma.conversation.findMany({
            where: { botId },
            select: { userPhone: true, userName: true },
            orderBy: { updatedAt: 'desc' },
        })

        const contacts: ExtractorContact[] = conversations
            .filter(c => c.userPhone && /^\+?\d{8,}$/.test(c.userPhone.replace(/\D/g, '')))
            .map(c => ({
                phone: c.userPhone.startsWith('+') ? c.userPhone : `+${c.userPhone}`,
                name: c.userName || null,
                source: 'Chat',
            }))

        return { success: true, contacts }
    } catch (err: any) {
        console.error('[EXTRACTOR] getAllChats error:', err)
        return { success: false, error: err.message || 'Error al obtener chats' }
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSock(botId: string): any {
    try {
        const conn = (BaileysManager as any).getConnection?.(botId) || null
        return conn?.sock || null
    } catch {
        return null
    }
}
