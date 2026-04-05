// Nexor Contacts Extractor — content.js (ISOLATED world)
// Bridge between extension popup and the MAIN world inject.js

let requestId = 0
const pending = new Map()

// Listen for responses from inject.js
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

function callInject(action, params = {}, timeoutMs = 60000) {
    return new Promise((resolve) => {
        const id = ++requestId
        pending.set(id, resolve)
        window.postMessage({ type: 'NEXOR_REQUEST', id, action, params }, '*')
        setTimeout(() => {
            if (pending.has(id)) {
                pending.delete(id)
                resolve({ success: false, error: 'Timeout' })
            }
        }, timeoutMs)
    })
}

// Listen for messages from extension popup
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    ;(async () => {
        try {
            const result = await callInject(request.action, request.params || {})
            sendResponse(result)
        } catch (err) {
            sendResponse({ success: false, error: err?.message || String(err) })
        }
    })()
    return true // async response
})

console.log('[Nexor] content.js loaded')
