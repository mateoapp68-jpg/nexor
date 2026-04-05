// Nexor Contacts Extractor — content.js (v3.0.0)
// DOM scraping technique used by popular extractors with 58k+ users.
// No webpack hooking, no Store access — uses stable ARIA roles.

const TAG = '[Nexor]'
const log = (...args) => console.log(TAG, ...args)

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// ─── Utilities ────────────────────────────────────────────────────────────────

function cleanPhone(str) {
    if (!str) return null
    const digits = String(str).replace(/\D/g, '')
    if (digits.length < 8 || digits.length > 15) return null
    return `+${digits}`
}

function realClick(el) {
    if (!el) return false
    try {
        const rect = el.getBoundingClientRect()
        const opts = {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2,
        }
        el.dispatchEvent(new MouseEvent('mousedown', opts))
        el.dispatchEvent(new MouseEvent('mouseup', opts))
        el.dispatchEvent(new MouseEvent('click', opts))
        return true
    } catch {
        return false
    }
}

async function waitFor(fn, timeout = 10000, interval = 200) {
    const start = Date.now()
    while (Date.now() - start < timeout) {
        const result = fn()
        if (result) return result
        await sleep(interval)
    }
    return null
}

// ─── Get chat list pane ───────────────────────────────────────────────────────
function getChatListPane() {
    return (
        document.querySelector('#pane-side [role="grid"]') ||
        document.querySelector('[aria-label="Lista de chats"]') ||
        document.querySelector('[aria-label="Chat list"]') ||
        document.querySelector('#pane-side')
    )
}

function getChatItems() {
    const pane = getChatListPane()
    if (!pane) return []
    return Array.from(pane.querySelectorAll('[role="listitem"], [role="row"]'))
        .filter(el => el.querySelector('span[title]'))
}

// ─── Group dialog helpers (role-based selectors, stable for 3+ years) ────────
function getGroupDialog() {
    return document.querySelector('[role="dialog"]')
}

function getMemberRows() {
    // Rows inside the group info dialog — stable ARIA roles
    const dialog = getGroupDialog()
    if (!dialog) return []
    return Array.from(dialog.querySelectorAll('[role="listitem"]'))
}

function getScrollableDialog() {
    const dialog = getGroupDialog()
    if (!dialog) return null
    // Find the scrollable container inside the dialog
    const candidates = dialog.querySelectorAll('div')
    for (const el of candidates) {
        const style = getComputedStyle(el)
        if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
            return el
        }
    }
    return dialog
}

async function closeDialog() {
    const dialog = getGroupDialog()
    if (!dialog) return
    const closeBtn = dialog.querySelector(
        '[aria-label="Cerrar"], [aria-label="Close"], button[aria-label*="errar"]'
    )
    if (closeBtn) {
        realClick(closeBtn)
        await sleep(300)
    } else {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }))
        await sleep(300)
    }
}

// ─── Extract phone + name from a member row ──────────────────────────────────
function extractFromRow(row) {
    if (!row) return null

    let phone = null
    let name = null

    // Method 1: img src contains "u=<phone>"
    const img = row.querySelector('img')
    if (img?.src) {
        const match = img.src.match(/[?&]u=(\d{8,15})/)
        if (match) phone = `+${match[1]}`
    }

    // Method 2: any span[title] whose title is a phone number (unsaved contacts)
    if (!phone) {
        const titleSpans = row.querySelectorAll('span[title]')
        for (const span of titleSpans) {
            const title = span.getAttribute('title') || ''
            const cleaned = cleanPhone(title)
            if (cleaned && /[+\s-]/.test(title)) { // must look like a phone with separators
                phone = cleaned
                break
            }
        }
    }

    // Method 3: innerText search for international format
    if (!phone) {
        const text = row.innerText || ''
        const match = text.match(/\+\d[\d\s\-()]{7,20}\d/)
        if (match) phone = cleanPhone(match[0])
    }

    // Name: look for span[title] that is NOT a phone number
    const titleSpans = row.querySelectorAll('span[title]')
    for (const span of titleSpans) {
        const title = span.getAttribute('title') || ''
        if (!title) continue
        // Skip if it's a phone number
        if (/^\+?\d[\d\s\-()]+$/.test(title.trim())) continue
        // Skip "You"/"Tú"
        if (/^(you|tú|tu)$/i.test(title.trim())) continue
        name = title.trim()
        break
    }

    return phone ? { phone, name: name || '' } : null
}

// ─── LIST GROUPS ──────────────────────────────────────────────────────────────
async function listGroups() {
    try {
        const pane = getChatListPane()
        if (!pane) return { success: false, error: 'Abrí WhatsApp Web y esperá a que cargue' }

        // Scroll chat list to load all chats
        let lastHeight = -1
        for (let i = 0; i < 30; i++) {
            pane.scrollTop = pane.scrollHeight
            await sleep(300)
            if (pane.scrollHeight === lastHeight) break
            lastHeight = pane.scrollHeight
        }
        pane.scrollTop = 0
        await sleep(400)

        const items = getChatItems()
        const groups = []

        for (let i = 0; i < items.length; i++) {
            const item = items[i]
            // Detect groups: icon or aria label
            const isGroup = !!item.querySelector(
                '[data-icon="default-group"], [data-icon="default-group-refreshed"], [data-icon="default-group-light"]'
            ) || /grupo|group/i.test(item.getAttribute('aria-label') || '')

            if (!isGroup) continue

            const nameEl = item.querySelector('span[title]')
            const name = nameEl?.getAttribute('title') || nameEl?.textContent?.trim() || 'Sin nombre'
            groups.push({ index: i, name })
        }

        log(`Found ${groups.length} groups of ${items.length} chats`)
        return { success: true, groups }
    } catch (err) {
        log('listGroups error:', err)
        return { success: false, error: err.message || String(err) }
    }
}

// ─── EXTRACT GROUP CONTACTS (by scraping Group Info dialog) ──────────────────
async function extractGroupContacts(groupIndex, groupName) {
    const contacts = []
    const seen = new Set()

    try {
        // 1. Click the group in the chat list
        const pane = getChatListPane()
        if (!pane) throw new Error('No se encontró la lista de chats')

        const items = getChatItems()
        const item = items[groupIndex]
        if (!item) throw new Error('Grupo no encontrado')

        realClick(item)
        await sleep(800)

        // 2. Click the chat header to open Group Info dialog
        const header = document.querySelector('#main header') || document.querySelector('header')
        if (!header) throw new Error('No se encontró el header del chat')

        // Click the first clickable element in header (avatar/name area)
        const headerClickable = header.querySelector('[role="button"]') || header.firstElementChild
        if (!headerClickable) throw new Error('No se encontró el botón del header')
        realClick(headerClickable)
        await sleep(1500)

        // 3. Wait for dialog to appear
        const dialog = await waitFor(() => getGroupDialog(), 5000)
        if (!dialog) throw new Error('No se abrió el panel de información del grupo')

        // 4. Find scrollable container
        const scrollable = getScrollableDialog()

        // 5. Click "View all members" / "Ver todos los X miembros" if it exists
        const viewAllBtn = Array.from(dialog.querySelectorAll('[role="button"]')).find(b => {
            const txt = (b.textContent || '').toLowerCase()
            return /ver\s+todos|view\s+all|miembros|members/i.test(txt)
        })
        if (viewAllBtn) {
            realClick(viewAllBtn)
            await sleep(800)
        }

        // 6. Scroll loop — extract members as they become visible
        let noNewCount = 0
        const maxNoNewIterations = 3
        let scrollTop = 0

        for (let iter = 0; iter < 100; iter++) {
            const rows = getMemberRows()
            let added = 0

            for (const row of rows) {
                const contact = extractFromRow(row)
                if (!contact) continue
                if (seen.has(contact.phone)) continue
                seen.add(contact.phone)
                contacts.push({
                    phone: contact.phone,
                    name: contact.name,
                    source: `Grupo: ${groupName}`,
                })
                added++
            }

            if (added === 0) {
                noNewCount++
                if (noNewCount >= maxNoNewIterations) break
            } else {
                noNewCount = 0
            }

            // Scroll down by fixed increment (the MehDAsaD pattern)
            if (scrollable) {
                scrollTop += 600
                scrollable.scrollTop = scrollTop
                // Fallback if scrollTop didn't advance
                if (scrollable.scrollTop < scrollTop - 10) {
                    scrollable.scrollTo({ top: scrollable.scrollHeight, behavior: 'auto' })
                }
            }
            await sleep(400)
        }

        log(`Group "${groupName}": extracted ${contacts.length} contacts`)

        await closeDialog()
        return contacts
    } catch (err) {
        log('extractGroupContacts error:', err)
        await closeDialog().catch(() => { })
        return contacts // return whatever we got
    }
}

// ─── GET GROUP CONTACTS (multiple groups by index) ────────────────────────────
async function getGroupContacts(groupIndexes, groupNames) {
    const all = []
    const seen = new Set()

    for (let i = 0; i < groupIndexes.length; i++) {
        const idx = groupIndexes[i]
        const name = groupNames[i] || `Grupo ${idx}`
        const contacts = await extractGroupContacts(idx, name)
        for (const c of contacts) {
            const key = `${name}:${c.phone}`
            if (seen.has(key)) continue
            seen.add(key)
            all.push(c)
        }
    }

    return { success: true, contacts: all }
}

// ─── LABELS (iterate label filter tabs + scrape chat list) ───────────────────
async function listLabels() {
    try {
        const systemTabs = [
            'todos', 'all', 'no leídos', 'unread', 'no leidos',
            'favoritos', 'favorites', 'grupos', 'groups',
            'comunidades', 'communities', 'contactos', 'contacts',
        ]

        const candidates = new Set()
        document.querySelectorAll('[role="tab"]').forEach(t => candidates.add(t))
        document.querySelectorAll('[aria-selected]').forEach(t => candidates.add(t))

        const labels = []
        const seenNames = new Set()
        for (const t of candidates) {
            const name = (t.textContent || '').trim()
            if (!name || name.length > 50) continue
            if (systemTabs.includes(name.toLowerCase())) continue
            if (/^\d+$/.test(name)) continue
            if (seenNames.has(name)) continue
            seenNames.add(name)
            labels.push({ name })
        }

        if (labels.length === 0) {
            return { success: false, error: 'No se encontraron etiquetas. Solo funciona con WhatsApp Business.' }
        }
        return { success: true, labels }
    } catch (err) {
        return { success: false, error: err.message || String(err) }
    }
}

async function extractLabelContacts(labelName) {
    const contacts = []
    const seen = new Set()

    try {
        // Click the label tab
        const tab = Array.from(document.querySelectorAll('[role="tab"], [aria-selected]'))
            .find(t => (t.textContent || '').trim() === labelName)
        if (!tab) return contacts

        realClick(tab)
        await sleep(800)

        const pane = getChatListPane()
        if (!pane) return contacts

        // Scroll to load all labeled chats
        let lastHeight = -1
        for (let i = 0; i < 20; i++) {
            pane.scrollTop = pane.scrollHeight
            await sleep(300)
            if (pane.scrollHeight === lastHeight) break
            lastHeight = pane.scrollHeight
        }
        pane.scrollTop = 0
        await sleep(400)

        // For each chat in the filtered list, click it and read the phone from header
        const items = getChatItems()
        for (let i = 0; i < items.length; i++) {
            const currentItems = getChatItems()
            const item = currentItems[i]
            if (!item) continue

            const nameEl = item.querySelector('span[title]')
            const name = nameEl?.getAttribute('title') || ''

            realClick(item)
            await sleep(500)

            // Click header to open contact info
            const header = document.querySelector('#main header')
            if (header) {
                const headerClickable = header.querySelector('[role="button"]') || header.firstElementChild
                if (headerClickable) {
                    realClick(headerClickable)
                    await sleep(700)

                    const dialog = getGroupDialog()
                    if (dialog) {
                        // Extract phone from dialog text
                        const text = dialog.innerText || ''
                        const match = text.match(/\+\d[\d\s\-()]{7,20}\d/)
                        if (match) {
                            const phone = cleanPhone(match[0])
                            if (phone && !seen.has(phone)) {
                                seen.add(phone)
                                contacts.push({
                                    phone,
                                    name,
                                    source: `Etiqueta: ${labelName}`,
                                })
                            }
                        }
                        await closeDialog()
                    }
                }
            }
        }

        return contacts
    } catch (err) {
        log('extractLabelContacts error:', err)
        return contacts
    }
}

async function getLabelContacts(labelNames) {
    const all = []
    for (const name of labelNames) {
        const contacts = await extractLabelContacts(name)
        all.push(...contacts)
    }
    return { success: true, contacts: all }
}

// ─── LIST ALL CHATS (name-only, for tab "all") ───────────────────────────────
async function listAllChats() {
    try {
        const pane = getChatListPane()
        if (!pane) return { success: false, error: 'Lista de chats no encontrada' }

        let lastHeight = -1
        for (let i = 0; i < 30; i++) {
            pane.scrollTop = pane.scrollHeight
            await sleep(300)
            if (pane.scrollHeight === lastHeight) break
            lastHeight = pane.scrollHeight
        }
        pane.scrollTop = 0
        await sleep(400)

        const items = getChatItems()
        const chats = []

        for (let i = 0; i < items.length; i++) {
            const item = items[i]
            const isGroup = !!item.querySelector('[data-icon*="default-group"]')
            if (isGroup) continue

            const nameEl = item.querySelector('span[title]')
            const name = nameEl?.getAttribute('title') || ''
            chats.push({ index: i, name })
        }

        return { success: true, total: chats.length, chats }
    } catch (err) {
        return { success: false, error: err.message || String(err) }
    }
}

async function extractAllChatsContacts() {
    const all = []
    const seen = new Set()

    try {
        const listResult = await listAllChats()
        if (!listResult.success) return { success: false, error: listResult.error }

        const pane = getChatListPane()
        if (!pane) return { success: false, error: 'Lista no encontrada' }

        const total = listResult.chats.length
        for (let i = 0; i < total; i++) {
            const items = getChatItems()
            const item = items[listResult.chats[i].index]
            if (!item) continue

            const nameEl = item.querySelector('span[title]')
            const name = nameEl?.getAttribute('title') || ''

            realClick(item)
            await sleep(500)

            const header = document.querySelector('#main header')
            if (header) {
                const headerClickable = header.querySelector('[role="button"]') || header.firstElementChild
                if (headerClickable) {
                    realClick(headerClickable)
                    await sleep(600)
                    const dialog = getGroupDialog()
                    if (dialog) {
                        const text = dialog.innerText || ''
                        const match = text.match(/\+\d[\d\s\-()]{7,20}\d/)
                        if (match) {
                            const phone = cleanPhone(match[0])
                            if (phone && !seen.has(phone)) {
                                seen.add(phone)
                                all.push({ phone, name, source: 'Chat' })
                            }
                        }
                        await closeDialog()
                    }
                }
            }
        }

        return { success: true, contacts: all }
    } catch (err) {
        return { success: false, error: err.message || String(err), contacts: all }
    }
}

// ─── Message listener ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    ;(async () => {
        try {
            let result
            switch (request?.action) {
                case 'ping':
                    result = {
                        success: true,
                        ready: !!getChatListPane(),
                    }
                    break
                case 'listGroups':
                    result = await listGroups()
                    break
                case 'listLabels':
                    result = await listLabels()
                    break
                case 'getGroupContacts':
                    result = await getGroupContacts(request.params?.groupIndexes || [], request.params?.groupNames || [])
                    break
                case 'getLabelContacts':
                    result = await getLabelContacts(request.params?.labelNames || [])
                    break
                case 'listAllChats':
                    result = await extractAllChatsContacts()
                    break
                default:
                    result = { success: false, error: `Acción desconocida: ${request?.action}` }
            }
            sendResponse(result)
        } catch (err) {
            log('Fatal error:', err)
            sendResponse({ success: false, error: err?.message || String(err) })
        }
    })()
    return true
})

log('content.js v3.0.0 loaded — DOM scraping mode')
