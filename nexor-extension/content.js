// Nexor WhatsApp Exporter — content script (v1.2.0)
// Robust detection for groups and labels with multiple fallback strategies

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const LOG = (...args) => console.log('[Nexor Exporter]', ...args)

// ─── Utilities ────────────────────────────────────────────────────────────────

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

function extractPhone(text) {
    if (!text) return null
    let match = text.match(/\+\d[\d\s\-\(\)]{7,20}\d/)
    if (match) return match[0].replace(/[\s\-\(\)]/g, '')
    match = text.match(/\b\d{8,15}\b/)
    if (match) return `+${match[0]}`
    return null
}

// ─── Find chat list container ─────────────────────────────────────────────────
function getChatListPane() {
    // Try multiple strategies — WhatsApp changes DOM frequently
    const candidates = [
        '#pane-side [role="grid"]',
        '[aria-label="Lista de chats"]',
        '[aria-label="Chat list"]',
        '[aria-label*="hat"]',
        '#pane-side [role="list"]',
        '#pane-side div[tabindex="0"]',
        '#pane-side',
    ]
    for (const sel of candidates) {
        const el = document.querySelector(sel)
        if (el) {
            LOG(`Chat list found via: ${sel}`)
            return el
        }
    }
    return null
}

// ─── Get all chat row items ───────────────────────────────────────────────────
function getChatItems(pane) {
    if (!pane) return []
    // Multiple selectors — grab all possible chat row containers
    const selectors = [
        '[role="listitem"]',
        '[role="row"]',
        '[data-testid^="cell-"]',
        'div[tabindex="-1"]',
    ]
    const allItems = new Set()
    for (const sel of selectors) {
        pane.querySelectorAll(sel).forEach(el => {
            // Must have a span[title] inside to be a chat (not a random div)
            if (el.querySelector('span[title]')) {
                allItems.add(el)
            }
        })
    }
    return Array.from(allItems)
}

// ─── Is this chat a group? Multiple strategies ───────────────────────────────
function isGroupChat(chatItem) {
    if (!chatItem) return false

    // Strategy 1: SVG data-icon hint
    const groupIcon = chatItem.querySelector(
        '[data-icon="default-group"],' +
        '[data-icon="default-group-refreshed"],' +
        '[data-icon="default-group-light"],' +
        '[data-testid="default-group"]'
    )
    if (groupIcon) return true

    // Strategy 2: aria-label on the item or any child contains "grupo" or "group"
    const aria = chatItem.getAttribute('aria-label') || ''
    if (/grupo|group/i.test(aria)) return true
    const ariaChild = chatItem.querySelector('[aria-label*="rupo"], [aria-label*="roup"]')
    if (ariaChild) return true

    // Strategy 3: Subtitle pattern "Name: message" (only groups show sender name)
    // Look for the subtitle span (second span[title] or secondary text)
    const spans = chatItem.querySelectorAll('span')
    for (const span of spans) {
        const text = span.textContent || ''
        // Pattern: "Nombre: mensaje" at start of preview
        if (/^[A-ZÁÉÍÓÚÑa-záéíóúñ][\wÁÉÍÓÚÑáéíóúñ\s]{1,25}:\s/.test(text) && text.length < 120) {
            return true
        }
    }

    // Strategy 4: Multi-letter avatar (groups often show "👥" icon)
    // Look for specific SVG paths used by group icons
    const svg = chatItem.querySelector('svg')
    if (svg) {
        const paths = svg.querySelectorAll('path')
        if (paths.length >= 2) {
            // Group icons usually have 2+ path elements (multiple people silhouettes)
            const svgText = svg.outerHTML
            if (svgText.includes('circle') && paths.length > 2) return true
        }
    }

    return false
}

// ─── Scrolling ────────────────────────────────────────────────────────────────
async function fullScroll(container, maxIter = 50, delay = 400) {
    if (!container) return
    let lastHeight = -1
    let stableCount = 0
    for (let i = 0; i < maxIter; i++) {
        container.scrollTop = container.scrollHeight
        await sleep(delay)
        if (container.scrollHeight === lastHeight) {
            stableCount++
            if (stableCount >= 3) break
        } else {
            stableCount = 0
        }
        lastHeight = container.scrollHeight
    }
    container.scrollTop = 0
    await sleep(500)
}

// ─── Get drawer / right panel ─────────────────────────────────────────────────
function getDrawer() {
    return document.querySelector(
        '[data-testid="drawer-right"],' +
        'div[role="dialog"],' +
        'div[data-animate-drawer-body="true"],' +
        'section[data-list-scroll-container]'
    )
}

async function closeDrawer() {
    const drawer = getDrawer()
    if (!drawer) return
    const closeBtn = drawer.querySelector(
        '[aria-label="Cerrar"],' +
        '[aria-label="Close"],' +
        'button[aria-label*="errar"],' +
        'div[role="button"][aria-label*="errar"]'
    )
    if (closeBtn) {
        realClick(closeBtn)
        await sleep(400)
    } else {
        // Press Escape as fallback
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }))
        await sleep(400)
    }
}

// ─── LIST GROUPS ──────────────────────────────────────────────────────────────
async function listGroups() {
    try {
        const pane = getChatListPane()
        if (!pane) throw new Error('No se encontró la lista de chats. Esperá a que cargue WhatsApp Web.')

        await fullScroll(pane)

        const items = getChatItems(pane)
        LOG(`Total chat items found: ${items.length}`)

        if (items.length === 0) {
            throw new Error('No se encontraron chats en la lista. Recargá WhatsApp Web.')
        }

        const groups = []
        for (let i = 0; i < items.length; i++) {
            const item = items[i]
            if (!isGroupChat(item)) continue
            const nameEl = item.querySelector('span[title]')
            const name = nameEl?.getAttribute('title') || nameEl?.textContent?.trim() || 'Sin nombre'
            groups.push({ index: i, name })
        }

        LOG(`Groups detected: ${groups.length}`, groups.map(g => g.name))

        if (groups.length === 0) {
            throw new Error(`No se encontraron grupos. Se revisaron ${items.length} chats. Asegurate de que tenés grupos visibles en tu lista de WhatsApp Web.`)
        }

        return { success: true, groups }
    } catch (err) {
        LOG('listGroups error:', err)
        return { success: false, error: err.message || String(err), groups: [] }
    }
}

// ─── LIST LABELS ──────────────────────────────────────────────────────────────
async function listLabels() {
    try {
        const systemTabs = ['todos', 'all', 'no leídos', 'unread', 'no leidos', 'favoritos', 'favorites', 'grupos', 'groups', 'todo', 'communities', 'comunidades', 'contactos', 'contacts']

        // Try multiple strategies
        const candidates = new Set()

        // Strategy 1: role="tab"
        document.querySelectorAll('[role="tab"]').forEach(t => candidates.add(t))

        // Strategy 2: filter test ids
        document.querySelectorAll('[data-testid^="chat-list-filter"], [data-testid*="filter"]').forEach(t => candidates.add(t))

        // Strategy 3: buttons in the filter area at top of #pane-side
        const pane = document.querySelector('#pane-side')
        if (pane) {
            // Filter buttons are usually in a horizontal scroll container near the top
            const topArea = pane.querySelector('header, div[role="region"]') || pane
            topArea.querySelectorAll('button, div[role="button"]').forEach(b => {
                const text = b.textContent?.trim() || ''
                if (text && text.length < 50 && text.length > 0) {
                    candidates.add(b)
                }
            })
        }

        // Strategy 4: Check for "Lists" (new WhatsApp feature) drawer
        // Lists appear as filter pills at top of chat list
        document.querySelectorAll('[aria-selected]').forEach(t => candidates.add(t))

        LOG(`Label candidates: ${candidates.size}`)

        const labels = []
        const seen = new Set()
        for (const t of candidates) {
            const name = t.textContent?.trim() || ''
            const lower = name.toLowerCase()
            if (!name || name.length > 50) continue
            if (systemTabs.includes(lower)) continue
            // Skip numeric-only (counts/badges)
            if (/^\d+$/.test(name)) continue
            // Skip duplicates
            if (seen.has(name)) continue
            seen.add(name)
            labels.push({ name })
        }

        LOG(`Labels detected: ${labels.length}`, labels.map(l => l.name))

        if (labels.length === 0) {
            return {
                success: false,
                error: 'No se encontraron etiquetas o listados. Esto funciona solo en cuentas de WhatsApp Business con etiquetas/listados creados. Abrí la consola (F12) para ver logs de debug.',
                labels: [],
            }
        }
        return { success: true, labels }
    } catch (err) {
        LOG('listLabels error:', err)
        return { success: false, error: err.message || String(err), labels: [] }
    }
}

// ─── EXPORT GROUPS (filtered) ─────────────────────────────────────────────────
async function exportGroups(selectedNames = null) {
    const rows = []
    const seen = new Set()
    try {
        const pane = getChatListPane()
        if (!pane) throw new Error('No se encontró la lista de chats.')

        await fullScroll(pane)

        const items = getChatItems(pane)
        const targets = []
        for (let i = 0; i < items.length; i++) {
            if (!isGroupChat(items[i])) continue
            const nameEl = items[i].querySelector('span[title]')
            const name = nameEl?.getAttribute('title') || 'Sin nombre'
            if (selectedNames && !selectedNames.includes(name)) continue
            targets.push({ index: i, name })
        }

        LOG(`Exporting ${targets.length} groups`)
        if (targets.length === 0) throw new Error('No hay grupos seleccionados para exportar')

        for (const { index, name: groupName } of targets) {
            const currentItems = getChatItems(pane)
            const item = currentItems[index]
            if (!item) continue

            realClick(item)
            await sleep(800)

            // Open group info
            const header = document.querySelector('#main header [role="button"], #main header [tabindex="0"]')
            if (!header) { LOG('header not found'); continue }
            realClick(header)
            await sleep(900)

            const drawer = getDrawer()
            if (!drawer) { LOG('drawer not found'); continue }

            // Scroll participant list
            const scrollables = drawer.querySelectorAll('[style*="overflow"], [data-tab], [class*="overflow"], section')
            for (const s of scrollables) {
                await fullScroll(s, 20, 200)
            }

            // Extract participants
            const participantRows = drawer.querySelectorAll('[role="listitem"]')
            LOG(`Group "${groupName}": ${participantRows.length} participant rows`)

            for (const p of participantRows) {
                const text = p.innerText || ''
                const phone = extractPhone(text)
                if (phone && !seen.has(`${groupName}:${phone}`)) {
                    seen.add(`${groupName}:${phone}`)
                    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
                    const nameLine = lines.find(l => !/^\+?\d/.test(l) && l.length < 50) || ''
                    rows.push({ phone, name: nameLine, source: `Grupo: ${groupName}` })
                }
            }
            await closeDrawer()
        }
        return { success: true, rows }
    } catch (err) {
        LOG('exportGroups error:', err)
        return { success: false, error: err.message || String(err), rows }
    }
}

// ─── EXPORT LABELS (filtered) ─────────────────────────────────────────────────
async function exportLabels(selectedNames = null) {
    const rows = []
    const seen = new Set()
    try {
        const listResult = await listLabels()
        if (!listResult.success) throw new Error(listResult.error)

        const targetNames = selectedNames || listResult.labels.map(l => l.name)

        for (const targetName of targetNames) {
            // Find the tab element fresh each iteration
            const allClickables = Array.from(document.querySelectorAll('[role="tab"], [data-testid*="filter"], button, div[role="button"], [aria-selected]'))
            const tab = allClickables.find(t => t.textContent?.trim() === targetName)
            if (!tab) { LOG(`Tab not found: ${targetName}`); continue }

            realClick(tab)
            await sleep(1000)

            const pane = getChatListPane()
            if (!pane) continue

            await fullScroll(pane, 20, 300)

            const items = getChatItems(pane)
            LOG(`Label "${targetName}": ${items.length} chats`)

            for (let i = 0; i < items.length; i++) {
                const currentItems = getChatItems(pane)
                const item = currentItems[i]
                if (!item) continue

                const nameEl = item.querySelector('span[title]')
                const name = nameEl?.getAttribute('title') || ''

                realClick(item)
                await sleep(500)

                const header = document.querySelector('#main header [role="button"], #main header [tabindex="0"]')
                if (header) {
                    realClick(header)
                    await sleep(700)
                    const drawer = getDrawer()
                    if (drawer) {
                        const phone = extractPhone(drawer.innerText)
                        if (phone && !seen.has(`${targetName}:${phone}`)) {
                            seen.add(`${targetName}:${phone}`)
                            rows.push({ phone, name, source: `Etiqueta: ${targetName}` })
                        }
                        await closeDrawer()
                    }
                }
            }
        }
        return { success: true, rows }
    } catch (err) {
        LOG('exportLabels error:', err)
        return { success: false, error: err.message || String(err), rows }
    }
}

// ─── EXPORT ALL CHATS ─────────────────────────────────────────────────────────
async function exportAllChats() {
    const rows = []
    const seen = new Set()
    try {
        const pane = getChatListPane()
        if (!pane) throw new Error('No se encontró la lista de chats.')

        await fullScroll(pane)

        const total = getChatItems(pane).length
        LOG(`Exporting all: ${total} chats`)
        if (total === 0) throw new Error('No se encontraron chats en la lista')

        for (let i = 0; i < total; i++) {
            const items = getChatItems(pane)
            const item = items[i]
            if (!item) continue

            const nameEl = item.querySelector('span[title]')
            const name = nameEl?.getAttribute('title') || nameEl?.textContent?.trim() || ''

            realClick(item)
            await sleep(500)

            const header = document.querySelector('#main header [role="button"], #main header [tabindex="0"]')
            if (header) {
                realClick(header)
                await sleep(700)
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
        LOG('exportAllChats error:', err)
        return { success: false, error: err.message || String(err), rows }
    }
}

// ─── DEBUG: dump DOM info ─────────────────────────────────────────────────────
async function debugDump() {
    const info = {
        chatListPaneFound: !!getChatListPane(),
        totalChatItems: 0,
        sampleItemHTML: '',
        tabsFound: 0,
        labelCandidates: [],
    }
    const pane = getChatListPane()
    if (pane) {
        const items = getChatItems(pane)
        info.totalChatItems = items.length
        if (items[0]) {
            info.sampleItemHTML = items[0].outerHTML.slice(0, 500)
        }
    }
    info.tabsFound = document.querySelectorAll('[role="tab"]').length
    document.querySelectorAll('[role="tab"], [data-testid*="filter"]').forEach(t => {
        const name = t.textContent?.trim() || ''
        if (name) info.labelCandidates.push(name)
    })
    LOG('DEBUG DUMP:', info)
    return { success: true, info }
}

// ─── MESSAGE LISTENER ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    ;(async () => {
        try {
            let result
            switch (request?.command) {
                case 'listGroups':
                    result = await listGroups()
                    break
                case 'listLabels':
                    result = await listLabels()
                    break
                case 'exportGroups':
                    result = await exportGroups(request.selectedNames)
                    break
                case 'exportLabels':
                    result = await exportLabels(request.selectedNames)
                    break
                case 'exportAllChats':
                    result = await exportAllChats()
                    break
                case 'debugDump':
                    result = await debugDump()
                    break
                default:
                    result = { success: false, error: `Comando desconocido: ${request?.command}` }
            }
            sendResponse(result)
        } catch (err) {
            LOG('Fatal error:', err)
            sendResponse({ success: false, error: err?.message || String(err) })
        }
    })()
    return true
})

LOG('Content script v1.2.0 loaded')
