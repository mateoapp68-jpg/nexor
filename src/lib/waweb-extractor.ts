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
            // Puppeteer downloads its own Chromium — no system install needed
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--single-process',
                '--no-zygote',
                '--disable-extensions',
                '--disable-background-networking',
                '--disable-translate',
                '--disable-sync',
                '--metrics-recording-only',
                '--no-first-run',
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

    client.on('loading_screen', (percent: number, message: string) => {
        console.log(`[WAWEB] Loading: ${percent}% - ${message} userId=${userId}`)
    })

    client.on('ready', () => {
        session.status = 'ready'
        session.phone = client.info?.wid?.user || ''
        console.log(`[WAWEB] ✓ READY for userId=${userId}, phone=${session.phone}`)
        resetAutoDestroy(session)
    })

    client.on('authenticated', () => {
        console.log(`[WAWEB] ✓ Authenticated userId=${userId}`)
        session.status = 'loading' // between auth and ready
    })

    client.on('auth_failure', (msg: string) => {
        session.status = 'error'
        console.error(`[WAWEB] ✗ Auth failure for userId=${userId}: ${msg}`)
    })

    client.on('disconnected', (reason: string) => {
        session.status = 'destroyed'
        console.log(`[WAWEB] Disconnected userId=${userId}: ${reason}`)
        sessions.delete(userId)
    })

    client.on('change_state', (state: string) => {
        console.log(`[WAWEB] State change userId=${userId}: ${state}`)
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

// ─── Helper: extract real phone from any whatsapp-web.js id ──────────────────
function extractRealPhone(idObj: any): string | null {
    if (!idObj) return null
    // id.user is always the real phone number in whatsapp-web.js
    const user = idObj.user || idObj._serialized?.split('@')[0] || ''
    // Must be digits only and 8-15 chars (real phone)
    if (!user || !/^\d{8,15}$/.test(user)) return null
    return `+${user}`
}

/**
 * List all groups with member count.
 */
export async function listGroups(userId: string): Promise<ExtractedGroup[]> {
    const s = getSession(userId)
    if (!s || s.status !== 'ready') return []

    try {
        const chats = await s.client.getChats()
        const groups: ExtractedGroup[] = []

        for (const c of chats) {
            if (!c.isGroup) continue
            // Try to get participant count from metadata
            let memberCount = 0
            try {
                const groupChat = c as any
                memberCount = groupChat.participants?.length
                    || groupChat.groupMetadata?.participants?.length
                    || 0
            } catch {}

            groups.push({
                id: c.id._serialized,
                name: c.name || 'Sin nombre',
                totalMembers: memberCount,
            })
        }

        groups.sort((a, b) => a.name.localeCompare(b.name))
        console.log(`[WAWEB] listGroups: ${groups.length} groups found`)
        return groups
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
            const groupChat = chat as any

            // Multiple ways to get participants
            let participants = groupChat.participants || []

            // Fallback 1: groupMetadata
            if (!participants.length && groupChat.groupMetadata?.participants) {
                participants = groupChat.groupMetadata.participants
            }

            // Fallback 2: fetch fresh metadata via getChat
            if (!participants.length) {
                try {
                    // Force refresh by getting chat again
                    const freshChat = await s.client.getChatById(gid) as any
                    if (freshChat.participants?.length) participants = freshChat.participants
                } catch {}
            }

            console.log(`[WAWEB] Group "${groupName}": ${participants.length} participants`)

            for (const p of participants) {
                const phone = extractRealPhone(p.id)
                if (!phone) continue
                if (seen.has(phone)) continue
                seen.add(phone)

                // Get contact name
                let name = ''
                try {
                    const pId = p.id?._serialized || p.id
                    const contact = await s.client.getContactById(typeof pId === 'string' ? pId : `${p.id.user}@c.us`)
                    name = contact?.pushname || contact?.name || contact?.verifiedName || ''
                } catch {}

                contacts.push({ phone, name, source: `Grupo: ${groupName}` })
            }
        } catch (err) {
            console.error(`[WAWEB] getGroupContacts error for ${gid}:`, err)
        }
    }

    console.log(`[WAWEB] getGroupContacts: ${contacts.length} total contacts`)
    return contacts
}

/**
 * List all labels with REAL contact count per label.
 */
export async function listLabels(userId: string): Promise<ExtractedLabel[]> {
    const s = getSession(userId)
    if (!s || s.status !== 'ready') return []

    try {
        const labels = await s.client.getLabels()
        const result: ExtractedLabel[] = []

        for (const l of labels) {
            // Count contacts for this label
            let contactCount = 0
            try {
                const labelChats = await s.client.getChatsByLabelId(l.id)
                // Count only non-group chats with real phone
                contactCount = labelChats.filter(c => {
                    if (c.isGroup) return false
                    return !!extractRealPhone(c.id)
                }).length
            } catch {}

            result.push({
                id: l.id,
                name: l.name || 'Sin nombre',
                hexColor: l.hexColor || '#64748b',
                contactCount,
            })
        }

        console.log(`[WAWEB] listLabels: ${result.length} labels, contacts: ${result.map(l => `${l.name}(${l.contactCount})`).join(', ')}`)
        return result
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

    // Cache labels for names
    let allLabels: any[] = []
    try { allLabels = await s.client.getLabels() } catch {}
    const labelNameById = new Map(allLabels.map((l: any) => [l.id, l.name || 'Etiqueta']))

    for (const labelId of labelIds) {
        try {
            const chats = await s.client.getChatsByLabelId(labelId)
            const labelName = labelNameById.get(labelId) || 'Etiqueta'

            console.log(`[WAWEB] Label "${labelName}": ${chats.length} chats`)

            for (const chat of chats) {
                if (chat.isGroup) continue

                const phone = extractRealPhone(chat.id)
                if (!phone) continue
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
            console.error(`[WAWEB] getLabelContacts error for label ${labelId}:`, err)
        }
    }

    console.log(`[WAWEB] getLabelContacts: ${contacts.length} total contacts`)
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

            const phone = extractRealPhone(chat.id)
            if (!phone) continue
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

    console.log(`[WAWEB] getAllChats: ${contacts.length} contacts`)
    return contacts
}
