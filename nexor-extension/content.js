// Nexor WhatsApp Exporter — content script
// Injected into https://web.whatsapp.com/* to read DOM and extract contacts

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// ─── Utilities ────────────────────────────────────────────────────────────────

// Dispatch real mouse events (React needs these, not just .click())
function realClick(el) {
    if (!el) return
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
}

// Extract phone from any text — handles +, international and local formats
function extractPhone(text) {
    if (!text) return null
    // Try international format first: +XX XXXXXXXXX
    let match = text.match(/\+\d[\d\s\-\(\)]{7,20}\d/)
    if (match) return match[0].replace(/[\s\-\(\)]/g, '')
    // Fallback: 8+ consecutive digits (local format)
    match = text.match(/\b\d{8,15}\b/)
    if (match) return `+${match[0]}`
    return null
}

// Get the current chat list pane (handles different WhatsApp versions)
function getChatListPane() {
    return document.querySelector(
        '[aria-label="Lista de chats"],' +
        '[aria-label="Chat list"],' +
        '#pane-side [role="grid"],' +
        '#pane-side'
    )
}

// Get the info drawer (right side panel)
function getDrawer() {
    return document.querySelector(
        '[data-testid="drawer-right"],' +
        'div[role="dialog"],' +
        'div[data-animate-drawer-body="true"]'
    )
}

// Close drawer if open
async function closeDrawer() {
    const drawer = getDrawer()
    if (!drawer) return
    const closeBtn = drawer.querySelector(
        '[aria-label="Cerrar"],' +
        '[aria-label="Close"],' +
        'button[aria-label*="errar"]'
    )
    if (closeBtn) {
        realClick(closeBtn)
        await sleep(300)
    }
}

// Scroll a container until it stops growing
async function fullScroll(container, maxIter = 30, delay = 350) {
    if (!container) return
    let lastHeight = -1
    for (let i = 0; i < maxIter; i++) {
        container.scrollTop = container.scrollHeight
        await sleep(delay)
        if (container.scrollHeight === lastHeight) break
        lastHeight = container.scrollHeight
    }
    container.scrollTop = 0
    await sleep(300)
}

// ─── EXPORT ALL CHATS ─────────────────────────────────────────────────────────
async function exportAllChats() {
    const rows = []
    const seen = new Set()
    try {
        const chatListPane = getChatListPane()
        if (!chatListPane) throw new Error('No se encontró la lista de chats. Esperá a que cargue WhatsApp Web.')

        await fullScroll(chatListPane)

        // Snapshot count — we iterate by index because clicks re-render the list
        const snapshot = Array.from(chatListPane.querySelectorAll('[role="listitem"], [role="row"]'))
        const total = snapshot.length
        if (total === 0) throw new Error('No se encontraron chats en la lista')

        for (let i = 0; i < total; i++) {
            // Re-query each iteration because DOM gets updated after clicks
            const items = chatListPane.querySelectorAll('[role="listitem"], [role="row"]')
            const item = items[i]
            if (!item) continue

            const nameEl = item.querySelector('span[title]')
            const name = nameEl?.getAttribute('title') || nameEl?.textContent?.trim() || ''

            realClick(item)
            await sleep(500)

            // Click header to open drawer
            const header = document.querySelector('#main header [role="button"]')
            if (header) {
                realClick(header)
                await sleep(600)
                const drawer = getDrawer()
                if (drawer) {
                    const phone = extractPhone(drawer.innerText)
                    if (phone && !seen.has(phone)) {
                        seen.add(phone)
                        rows.push({ phone, name, source: 'Chat' })
                    }
                    await closeDrawer()
                }
            }
        }
        return { success: true, rows }
    } catch (err) {
        return { success: false, error: err.message || String(err), rows }
    }
}

// ─── EXPORT GROUPS ────────────────────────────────────────────────────────────
async function exportGroups() {
    const rows = []
    const seen = new Set()
    try {
        const chatListPane = getChatListPane()
        if (!chatListPane) throw new Error('No se encontró la lista de chats. Esperá a que cargue WhatsApp Web.')

        await fullScroll(chatListPane)

        const snapshot = Array.from(chatListPane.querySelectorAll('[role="listitem"], [role="row"]'))
        const groupIndexes = []
        for (let i = 0; i < snapshot.length; i++) {
            const item = snapshot[i]
            const isGroup = item.querySelector(
                '[data-icon="default-group"],' +
                '[data-icon="default-group-refreshed"],' +
                '[data-testid="default-group"]'
            )
            if (isGroup) groupIndexes.push(i)
        }

        if (groupIndexes.length === 0) {
            throw new Error('No se encontraron grupos en la lista de chats')
        }

        for (const idx of groupIndexes) {
            const items = chatListPane.querySelectorAll('[role="listitem"], [role="row"]')
            const item = items[idx]
            if (!item) continue

            const nameEl = item.querySelector('span[title]')
            const groupName = nameEl?.getAttribute('title') || 'Sin nombre'

            realClick(item)
            await sleep(700)

            // Open group info
            const header = document.querySelector('#main header [role="button"]')
            if (!header) continue
            realClick(header)
            await sleep(800)

            const drawer = getDrawer()
            if (!drawer) continue

            // Scroll participants list
            const scrollables = drawer.querySelectorAll('[style*="overflow"], [data-tab], [class*="overflow"]')
            for (const s of scrollables) {
                await fullScroll(s, 15, 250)
            }

            // Parse participants — each row has phone or name
            const participantRows = drawer.querySelectorAll('[role="listitem"]')
            for (const p of participantRows) {
                const text = p.innerText || ''
                const phone = extractPhone(text)
                if (phone && !seen.has(`${groupName}:${phone}`)) {
                    seen.add(`${groupName}:${phone}`)
                    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
                    const nameLine = lines.find(l => !/^\+?\d/.test(l)) || ''
                    rows.push({ phone, name: nameLine, source: `Grupo: ${groupName}` })
                }
            }

            await closeDrawer()
        }
        return { success: true, rows }
    } catch (err) {
        return { success: false, error: err.message || String(err), rows }
    }
}

// ─── EXPORT BY LABELS ─────────────────────────────────────────────────────────
async function exportLabels() {
    const rows = []
    const seen = new Set()
    try {
        // WhatsApp Business shows label filter tabs at top of chat list
        const filterTabs = Array.from(document.querySelectorAll('[role="tab"], [data-testid^="chat-list-filter"]'))
        const systemTabs = ['todos', 'all', 'no leídos', 'unread', 'favoritos', 'favorites', 'grupos', 'groups', 'todo', 'communities', 'comunidades']

        const labelTabs = filterTabs.filter(t => {
            const text = t.textContent?.trim().toLowerCase() || ''
            return text && !systemTabs.includes(text) && text.length < 50
        })

        if (labelTabs.length === 0) {
            throw new Error('No se encontraron etiquetas. Esta función solo funciona con cuentas de WhatsApp Business.')
        }

        for (const tab of labelTabs) {
            const labelName = tab.textContent?.trim() || 'Sin nombre'
            realClick(tab)
            await sleep(900)

            const chatListPane = getChatListPane()
            if (!chatListPane) continue

            await fullScroll(chatListPane, 20, 300)

            const total = chatListPane.querySelectorAll('[role="listitem"], [role="row"]').length
            for (let i = 0; i < total; i++) {
                const items = chatListPane.querySelectorAll('[role="listitem"], [role="row"]')
                const item = items[i]
                if (!item) continue

                const nameEl = item.querySelector('span[title]')
                const name = nameEl?.getAttribute('title') || ''

                realClick(item)
                await sleep(500)

                const header = document.querySelector('#main header [role="button"]')
                if (header) {
                    realClick(header)
                    await sleep(600)
                    const drawer = getDrawer()
                    if (drawer) {
                        const phone = extractPhone(drawer.innerText)
                        if (phone && !seen.has(`${labelName}:${phone}`)) {
                            seen.add(`${labelName}:${phone}`)
                            rows.push({ phone, name, source: `Etiqueta: ${labelName}` })
                        }
                        await closeDrawer()
                    }
                }
            }
        }
        return { success: true, rows }
    } catch (err) {
        return { success: false, error: err.message || String(err), rows }
    }
}

// ─── MESSAGE LISTENER ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    // Must wrap in async IIFE + try/catch so sendResponse is ALWAYS called
    ;(async () => {
        try {
            let result
            switch (request?.command) {
                case 'exportGroups':
                    result = await exportGroups()
                    break
                case 'exportLabels':
                    result = await exportLabels()
                    break
                case 'exportAllChats':
                    result = await exportAllChats()
                    break
                default:
                    result = { success: false, error: `Comando desconocido: ${request?.command}`, rows: [] }
            }
            sendResponse(result)
        } catch (err) {
            sendResponse({ success: false, error: err?.message || String(err), rows: [] })
        }
    })()
    return true // keep channel open for async response
})

console.log('[Nexor Exporter] Content script loaded on web.whatsapp.com')
