// Nexor WhatsApp Exporter — content.js (v1.3.0)
// Bridge between extension popup and the page-context inject.js.
// inject.js runs in MAIN world (has access to window.Store) via manifest.

const LOG = (...args) => console.log('[Nexor Content]', ...args)

let requestId = 0
const pending = new Map()

// Listen for responses from inject.js (same window, different world)
window.addEventListener('message', (event) => {
    if (event.source !== window) return
    const data = event.data
    if (!data || data.type !== 'NEXOR_RESPONSE') return
    const resolver = pending.get(data.id)
    if (resolver) {
        resolver(data.result)
        pending.delete(data.id)
    }
})

// Call inject.js via postMessage
function callInject(action, params = {}, timeoutMs = 60000) {
    return new Promise((resolve) => {
        const id = ++requestId
        pending.set(id, resolve)
        window.postMessage({ type: 'NEXOR_REQUEST', id, action, params }, '*')
        setTimeout(() => {
            if (pending.has(id)) {
                pending.delete(id)
                resolve({ success: false, error: 'Timeout esperando respuesta de WhatsApp Web' })
            }
        }, timeoutMs)
    })
}

// ─── Command handlers ──────────────────────────────────────────────────────
async function listGroups() {
    return await callInject('listGroups')
}

async function listLabels() {
    return await callInject('listLabels')
}

async function exportGroups(selectedIds = null, selectedNamesMap = {}) {
    const rows = []
    const seen = new Set()
    try {
        if (!selectedIds || selectedIds.length === 0) {
            return { success: false, error: 'No hay grupos seleccionados' }
        }

        for (const groupId of selectedIds) {
            const result = await callInject('getGroupContacts', { groupId })
            if (!result.success) {
                LOG(`Error in group ${groupId}:`, result.error)
                continue
            }
            const groupName = selectedNamesMap[groupId] || 'Grupo'
            for (const c of result.contacts) {
                const key = `${groupName}:${c.phone}`
                if (seen.has(key)) continue
                seen.add(key)
                rows.push({ phone: c.phone, name: c.name, source: `Grupo: ${groupName}` })
            }
        }
        return { success: true, rows }
    } catch (err) {
        return { success: false, error: err.message || String(err), rows }
    }
}

async function exportLabels(selectedIds = null, selectedNamesMap = {}) {
    const rows = []
    const seen = new Set()
    try {
        if (!selectedIds || selectedIds.length === 0) {
            return { success: false, error: 'No hay etiquetas seleccionadas' }
        }

        for (const labelId of selectedIds) {
            const result = await callInject('getLabelContacts', { labelId })
            if (!result.success) {
                LOG(`Error in label ${labelId}:`, result.error)
                continue
            }
            const labelName = selectedNamesMap[labelId] || 'Etiqueta'
            for (const c of result.contacts) {
                const key = `${labelName}:${c.phone}`
                if (seen.has(key)) continue
                seen.add(key)
                rows.push({ phone: c.phone, name: c.name, source: `Etiqueta: ${labelName}` })
            }
        }
        return { success: true, rows }
    } catch (err) {
        return { success: false, error: err.message || String(err), rows }
    }
}

async function exportAllChats() {
    try {
        const result = await callInject('listAllChats')
        if (!result.success) return result
        const rows = result.contacts.map(c => ({ ...c, source: 'Chat' }))
        return { success: true, rows }
    } catch (err) {
        return { success: false, error: err.message || String(err), rows: [] }
    }
}

// ─── Extension message listener ────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    ;(async () => {
        try {
            let result
            switch (request?.command) {
                case 'ping':
                    result = await callInject('ping', {}, 5000)
                    break
                case 'listGroups':
                    result = await listGroups()
                    break
                case 'listLabels':
                    result = await listLabels()
                    break
                case 'exportGroups':
                    result = await exportGroups(request.selectedIds, request.selectedNamesMap)
                    break
                case 'exportLabels':
                    result = await exportLabels(request.selectedIds, request.selectedNamesMap)
                    break
                case 'exportAllChats':
                    result = await exportAllChats()
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

LOG('Content script v1.3.0 loaded')
