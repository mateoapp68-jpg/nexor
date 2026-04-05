/**
 * WhatsApp Web Extractor — whatsapp-web.js session manager
 *
 * Creates temporary headless Chrome sessions to extract groups, labels,
 * and contacts with REAL phone numbers. Sessions are destroyed after use.
 */

import { Client, LocalAuth } from 'whatsapp-web.js'
import { toDataURL } from 'qrcode'
import path from 'path'
import fs from 'fs'

export interface WaWebSession {
    id: string
    userId: string
    client: Client
    status: 'qr' | 'loading' | 'ready' | 'error' | 'destroyed'
    qrBase64?: string
    phone?: string
    createdAt: Date
    lastUsed: Date
    autoDestroyTimer?: ReturnType<typeof setTimeout>
}

// In-memory store of active sessions
declare global {
    var __waweb_sessions: Map<string, WaWebSession> | undefined
}
const sessions: Map<string, WaWebSession> =
    global.__waweb_sessions ?? (global.__waweb_sessions = new Map())

const SESSIONS_DIR = path.join(process.cwd(), 'waweb-sessions')
const AUTO_DESTROY_MS = 10 * 60 * 1000 // 10 min idle → destroy

// ─── Session management ───────────────────────────────────────────────────────

export async function createSession(userId: string): Promise<WaWebSession> {
    // Reuse if already exists
    const existing = sessions.get(userId)
    if (existing && existing.status !== 'destroyed' && existing.status !== 'error') {
        existing.lastUsed = new Date()
        resetAutoDestroy(existing)
        return existing
    }

    // Ensure sessions dir exists
    if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true })

    const sessionPath = path.join(SESSIONS_DIR, userId)

    const client = new Client({
        authStrategy: new LocalAuth({ dataPath: sessionPath }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--single-process',
            ],
        },
    })

    const session: WaWebSession = {
        id: userId,
        userId,
        client,
        status: 'loading',
        createdAt: new Date(),
        lastUsed: new Date(),
    }

    sessions.set(userId, session)

    // Events
    client.on('qr', async (qr: string) => {
        try {
            session.qrBase64 = await toDataURL(qr)
            session.status = 'qr'
            console.log(`[WAWEB] QR generated for userId=${userId}`)
        } catch (err) {
            console.error('[WAWEB] QR generation error:', err)
        }
    })

    client.on('ready', () => {
        session.status = 'ready'
        session.phone = client.info?.wid?.user || ''
        console.log(`[WAWEB] Ready for userId=${userId}, phone=${session.phone}`)
        resetAutoDestroy(session)
    })

    client.on('authenticated', () => {
        console.log(`[WAWEB] Authenticated userId=${userId}`)
    })

    client.on('auth_failure', () => {
        session.status = 'error'
        console.error(`[WAWEB] Auth failure for userId=${userId}`)
    })

    client.on('disconnected', () => {
        session.status = 'destroyed'
        console.log(`[WAWEB] Disconnected userId=${userId}`)
        sessions.delete(userId)
    })

    // Initialize
    try {
        await client.initialize()
    } catch (err) {
        console.error(`[WAWEB] Initialize error for userId=${userId}:`, err)
        session.status = 'error'
    }

    return session
}

export function getSession(userId: string): WaWebSession | null {
    const s = sessions.get(userId)
    if (!s || s.status === 'destroyed') return null
    s.lastUsed = new Date()
    resetAutoDestroy(s)
    return s
}

export async function destroySession(userId: string): Promise<void> {
    const s = sessions.get(userId)
    if (!s) return
    try {
        if (s.autoDestroyTimer) clearTimeout(s.autoDestroyTimer)
        await s.client.destroy().catch(() => {})
    } catch {}
    s.status = 'destroyed'
    sessions.delete(userId)
    console.log(`[WAWEB] Session destroyed for userId=${userId}`)
}

function resetAutoDestroy(session: WaWebSession) {
    if (session.autoDestroyTimer) clearTimeout(session.autoDestroyTimer)
    session.autoDestroyTimer = setTimeout(() => {
        console.log(`[WAWEB] Auto-destroying idle session userId=${session.userId}`)
        destroySession(session.userId)
    }, AUTO_DESTROY_MS)
}

// ─── Data extraction ──────────────────────────────────────────────────────────

export interface ExtractedGroup {
    id: string
    name: string
    totalMembers: number
}

export interface ExtractedLabel {
    id: string
    name: string
    hexColor: string
    contactCount: number
}

export interface ExtractedContact {
    phone: string
    name: string
    source: string
}

/**
 * List all groups the user participates in.
 */
export async function listGroups(userId: string): Promise<ExtractedGroup[]> {
    const s = getSession(userId)
    if (!s || s.status !== 'ready') return []

    try {
        const chats = await s.client.getChats()
        return chats
            .filter(c => c.isGroup)
            .map(c => ({
                id: c.id._serialized,
                name: c.name || 'Sin nombre',
                totalMembers: (c as any).groupMetadata?.participants?.length || 0,
            }))
            .sort((a, b) => a.name.localeCompare(b.name))
    } catch (err) {
        console.error('[WAWEB] listGroups error:', err)
        return []
    }
}

/**
 * Get members of specific groups with REAL phone numbers.
 */
export async function getGroupContacts(userId: string, groupIds: string[]): Promise<ExtractedContact[]> {
    const s = getSession(userId)
    if (!s || s.status !== 'ready') return []

    const contacts: ExtractedContact[] = []
    const seen = new Set<string>()

    for (const gid of groupIds) {
        try {
            const chat = await s.client.getChatById(gid)
            if (!chat || !chat.isGroup) continue

            const groupName = chat.name || 'Grupo'

            // Get participants
            const groupChat = chat as any
            let participants = groupChat.participants || groupChat.groupMetadata?.participants || []

            // If empty, try fetching metadata directly
            if ((!participants || participants.length === 0) && s.client.getContactById) {
                try {
                    const inviteInfo = await (s.client as any).groupMetadata(gid)
                    if (inviteInfo?.participants) participants = inviteInfo.participants
                } catch {}
            }

            for (const p of participants) {
                const phoneUser = p.id?.user || p.id?._serialized?.split('@')[0] || ''
                if (!phoneUser || phoneUser.length < 8) continue

                const phone = `+${phoneUser}`
                if (seen.has(phone)) continue
                seen.add(phone)

                // Try to get contact name
                let name = ''
                try {
                    const contact = await s.client.getContactById(p.id._serialized || `${phoneUser}@c.us`)
                    name = contact?.pushname || contact?.name || contact?.verifiedName || ''
                } catch {}

                contacts.push({ phone, name, source: `Grupo: ${groupName}` })
            }
        } catch (err) {
            console.error(`[WAWEB] getGroupContacts error for ${gid}:`, err)
        }
    }

    return contacts
}

/**
 * List all labels (WhatsApp Business only).
 */
export async function listLabels(userId: string): Promise<ExtractedLabel[]> {
    const s = getSession(userId)
    if (!s || s.status !== 'ready') return []

    try {
        const labels = await s.client.getLabels()
        return labels.map(l => ({
            id: l.id,
            name: l.name || 'Sin nombre',
            hexColor: l.hexColor || '#64748b',
            contactCount: 0, // filled on demand
        }))
    } catch (err) {
        console.error('[WAWEB] listLabels error:', err)
        return []
    }
}

/**
 * Get contacts from specific labels with REAL phone numbers.
 */
export async function getLabelContacts(userId: string, labelIds: string[]): Promise<ExtractedContact[]> {
    const s = getSession(userId)
    if (!s || s.status !== 'ready') return []

    const contacts: ExtractedContact[] = []
    const seen = new Set<string>()

    for (const labelId of labelIds) {
        try {
            const chats = await s.client.getChatsByLabelId(labelId)
            const labelObj = (await s.client.getLabels()).find(l => l.id === labelId)
            const labelName = labelObj?.name || 'Etiqueta'

            for (const chat of chats) {
                if (chat.isGroup) continue

                const phoneUser = chat.id?.user || chat.id?._serialized?.split('@')[0] || ''
                if (!phoneUser || phoneUser.length < 8) continue

                const phone = `+${phoneUser}`
                if (seen.has(phone)) continue
                seen.add(phone)

                let name = ''
                try {
                    const contact = await chat.getContact()
                    name = contact?.pushname || contact?.name || contact?.verifiedName || ''
                } catch {}

                contacts.push({ phone, name, source: `Etiqueta: ${labelName}` })
            }
        } catch (err) {
            console.error(`[WAWEB] getLabelContacts error for ${labelId}:`, err)
        }
    }

    return contacts
}

/**
 * Get all individual chats (non-group) with REAL phone numbers.
 */
export async function getAllChats(userId: string): Promise<ExtractedContact[]> {
    const s = getSession(userId)
    if (!s || s.status !== 'ready') return []

    const contacts: ExtractedContact[] = []
    const seen = new Set<string>()

    try {
        const chats = await s.client.getChats()
        for (const chat of chats) {
            if (chat.isGroup) continue

            const phoneUser = chat.id?.user || chat.id?._serialized?.split('@')[0] || ''
            if (!phoneUser || phoneUser.length < 8) continue

            const phone = `+${phoneUser}`
            if (seen.has(phone)) continue
            seen.add(phone)

            let name = ''
            try {
                const contact = await chat.getContact()
                name = contact?.pushname || contact?.name || contact?.verifiedName || ''
            } catch {}

            contacts.push({ phone, name, source: 'Chat' })
        }
    } catch (err) {
        console.error('[WAWEB] getAllChats error:', err)
    }

    return contacts
}
