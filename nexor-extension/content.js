// Nexor WhatsApp Exporter — content script
// Injected into https://web.whatsapp.com/* to read DOM and extract contacts

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// Utility: find element by text content
function findByText(selector, text) {
    const elements = document.querySelectorAll(selector)
    for (const el of elements) {
        if (el.textContent?.trim() === text) return el
    }
    return null
}

// Utility: wait for element to appear
async function waitFor(selector, timeout = 5000) {
    const start = Date.now()
    while (Date.now() - start < timeout) {
        const el = document.querySelector(selector)
        if (el) return el
        await sleep(100)
    }
    return null
}

// Utility: click element and wait
async function clickAndWait(el, ms = 400) {
    if (!el) return
    el.click()
    await sleep(ms)
}

// Extract phone from element (WhatsApp shows phones in various places)
function extractPhone(text) {
    if (!text) return null
    // Match international format: +XX XXXXXXXXX
    const match = text.match(/\+\d[\d\s\-]{7,18}\d/)
    if (!match) return null
    return match[0].replace(/[\s\-]/g, '')
}

// ─── EXPORT ALL CHATS ─────────────────────────────────────────────────────────
async function exportAllChats() {
    const rows = []
    try {
        // Scroll chat list to load all chats
        const chatListPane = document.querySelector('[aria-label="Lista de chats"], [aria-label="Chat list"], #pane-side')
        if (!chatListPane) throw new Error('No se encontró la lista de chats')

        // Scroll to load all chats
        let lastHeight = 0
        for (let i = 0; i < 30; i++) {
            chatListPane.scrollTop = chatListPane.scrollHeight
            await sleep(400)
            if (chatListPane.scrollHeight === lastHeight) break
            lastHeight = chatListPane.scrollHeight
        }
        chatListPane.scrollTop = 0
        await sleep(500)

        // Get all chat items
        const chatItems = chatListPane.querySelectorAll('[role="listitem"], [role="row"]')
        for (const item of chatItems) {
            const nameEl = item.querySelector('span[title], span[dir="auto"]')
            const name = nameEl?.getAttribute('title') || nameEl?.textContent?.trim() || ''
            // Click to open chat
            item.click()
            await sleep(500)
            // Click header to show contact info
            const header = document.querySelector('header [role="button"][title], header span[dir="auto"]')
            if (header) {
                header.click()
                await sleep(700)
                // Read phone from drawer
                const drawer = document.querySelector('[data-testid="drawer-right"], div[role="dialog"]')
                if (drawer) {
                    const text = drawer.innerText
                    const phone = extractPhone(text)
                    if (phone) {
                        rows.push({ phone, name, source: 'Chat' })
                    }
                    // Close drawer
                    const closeBtn = drawer.querySelector('[aria-label="Cerrar"], [aria-label="Close"]')
                    if (closeBtn) await clickAndWait(closeBtn, 300)
                }
            }
        }
        return { success: true, rows }
    } catch (err) {
        return { success: false, error: err.message, rows }
    }
}

// ─── EXPORT GROUPS ────────────────────────────────────────────────────────────
async function exportGroups() {
    const rows = []
    try {
        // Click "Nueva" or find the groups filter if exists
        // Alternative: iterate all chats and filter groups

        const chatListPane = document.querySelector('[aria-label="Lista de chats"], [aria-label="Chat list"], #pane-side')
        if (!chatListPane) throw new Error('No se encontró la lista de chats')

        // Scroll to load all
        let lastHeight = 0
        for (let i = 0; i < 30; i++) {
            chatListPane.scrollTop = chatListPane.scrollHeight
            await sleep(400)
            if (chatListPane.scrollHeight === lastHeight) break
            lastHeight = chatListPane.scrollHeight
        }
        chatListPane.scrollTop = 0
        await sleep(500)

        const chatItems = Array.from(chatListPane.querySelectorAll('[role="listitem"], [role="row"]'))

        for (const item of chatItems) {
            // Check if it's a group (has group icon or multiple names shown)
            const isGroup = item.querySelector('[data-icon="default-group"], [data-testid="default-group"]')
            if (!isGroup) continue

            const nameEl = item.querySelector('span[title]')
            const groupName = nameEl?.getAttribute('title') || 'Sin nombre'

            item.click()
            await sleep(600)

            // Click group header to open info
            const header = document.querySelector('header [role="button"], header span[dir="auto"]')
            if (header) {
                header.click()
                await sleep(800)

                // Find participants list in drawer
                const drawer = document.querySelector('[data-testid="drawer-right"], div[role="dialog"]')
                if (drawer) {
                    // Scroll participants list
                    const scrollable = drawer.querySelector('[style*="overflow"], [data-tab]')
                    if (scrollable) {
                        let lh = 0
                        for (let i = 0; i < 20; i++) {
                            scrollable.scrollTop = scrollable.scrollHeight
                            await sleep(300)
                            if (scrollable.scrollHeight === lh) break
                            lh = scrollable.scrollHeight
                        }
                    }
                    // Parse participants: each has a phone or name
                    const items = drawer.querySelectorAll('[role="listitem"], [role="button"]')
                    for (const p of items) {
                        const text = p.innerText || ''
                        const phone = extractPhone(text)
                        if (phone) {
                            // First line is usually name or phone
                            const lines = text.split('\n').filter(Boolean)
                            const name = lines[0] && !lines[0].includes('+') ? lines[0] : ''
                            rows.push({ phone, name, source: `Grupo: ${groupName}` })
                        }
                    }
                    // Close drawer
                    const closeBtn = drawer.querySelector('[aria-label="Cerrar"], [aria-label="Close"]')
                    if (closeBtn) await clickAndWait(closeBtn, 300)
                }
            }
        }
        return { success: true, rows }
    } catch (err) {
        return { success: false, error: err.message, rows }
    }
}

// ─── EXPORT BY LABELS ─────────────────────────────────────────────────────────
async function exportLabels() {
    const rows = []
    try {
        // WhatsApp Business: labels appear as filter tabs at top
        // Click "Etiquetas" menu or navigate filter tabs

        // Find label filter tabs
        const filterTabs = document.querySelectorAll('[role="tab"], [data-testid="chat-list-filter"]')
        const labelTabs = Array.from(filterTabs).filter(t => {
            const text = t.textContent?.trim().toLowerCase() || ''
            return text && !['todos', 'all', 'no leídos', 'unread', 'favoritos', 'favorites', 'grupos', 'groups'].includes(text)
        })

        if (labelTabs.length === 0) {
            throw new Error('No se encontraron etiquetas. Asegurate de usar WhatsApp Business.')
        }

        for (const tab of labelTabs) {
            const labelName = tab.textContent?.trim() || 'Sin nombre'
            tab.click()
            await sleep(800)

            const chatListPane = document.querySelector('[aria-label="Lista de chats"], [aria-label="Chat list"], #pane-side')
            if (!chatListPane) continue

            // Scroll to load all filtered chats
            let lh = 0
            for (let i = 0; i < 20; i++) {
                chatListPane.scrollTop = chatListPane.scrollHeight
                await sleep(300)
                if (chatListPane.scrollHeight === lh) break
                lh = chatListPane.scrollHeight
            }
            chatListPane.scrollTop = 0
            await sleep(400)

            const chatItems = Array.from(chatListPane.querySelectorAll('[role="listitem"], [role="row"]'))
            for (const item of chatItems) {
                const nameEl = item.querySelector('span[title]')
                const name = nameEl?.getAttribute('title') || ''
                item.click()
                await sleep(500)
                const header = document.querySelector('header [role="button"], header span[dir="auto"]')
                if (header) {
                    header.click()
                    await sleep(600)
                    const drawer = document.querySelector('[data-testid="drawer-right"], div[role="dialog"]')
                    if (drawer) {
                        const phone = extractPhone(drawer.innerText)
                        if (phone) {
                            rows.push({ phone, name, source: `Etiqueta: ${labelName}` })
                        }
                        const closeBtn = drawer.querySelector('[aria-label="Cerrar"], [aria-label="Close"]')
                        if (closeBtn) await clickAndWait(closeBtn, 300)
                    }
                }
            }
        }
        return { success: true, rows }
    } catch (err) {
        return { success: false, error: err.message, rows }
    }
}

// ─── MESSAGE LISTENER ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    const run = async () => {
        if (request.command === 'exportGroups') {
            const result = await exportGroups()
            sendResponse(result)
        } else if (request.command === 'exportLabels') {
            const result = await exportLabels()
            sendResponse(result)
        } else if (request.command === 'exportAllChats') {
            const result = await exportAllChats()
            sendResponse(result)
        }
    }
    run()
    return true // keep channel open for async response
})

console.log('[Nexor Exporter] Content script loaded on web.whatsapp.com')
