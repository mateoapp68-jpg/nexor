// Nexor Desktop — extractor script
// This runs inside the WhatsApp Web webview via executeJavaScript.
// Has access to the page's Chromium context, so we can hunt webpack modules.

(function () {
    if (window.__nexorExtractor) return 'already loaded'
    window.__nexorExtractor = true

    const LOG = (...args) => console.log('[Nexor]', ...args)

    let Store = null
    let allModules = null

    // ─── Webpack hunt ────────────────────────────────────────────────────────
    function loadAllModules() {
        if (allModules) return allModules

        const chunkKey = Object.keys(window).find(k => k.startsWith('webpackChunk'))
        if (!chunkKey) return null

        const chunkArray = window[chunkKey]
        if (!Array.isArray(chunkArray) || chunkArray.length === 0) return null

        const modules = []
        try {
            chunkArray.push([
                ['nexor_' + Math.random().toString(36).slice(2)],
                {},
                function (r) {
                    for (const id in r.m) {
                        try {
                            const m = r(id)
                            if (m) modules.push(m)
                        } catch { }
                    }
                },
            ])
        } catch (err) {
            LOG('push error:', err)
            return null
        }

        if (modules.length > 0) allModules = modules
        return modules
    }

    function matchStore(store, obj) {
        if (!obj || typeof obj !== 'object') return
        if (!store.Chat && obj.Chat && typeof obj.Chat.getModelsArray === 'function') store.Chat = obj.Chat
        if (!store.Contact && obj.Contact && typeof obj.Contact.getModelsArray === 'function') store.Contact = obj.Contact
        if (!store.Label && obj.Label && typeof obj.Label.getModelsArray === 'function') store.Label = obj.Label
        if (!store.GroupMetadata && obj.GroupMetadata && typeof obj.GroupMetadata.getModelsArray === 'function') store.GroupMetadata = obj.GroupMetadata
    }

    function findStore(modules) {
        const store = {}
        for (const mod of modules) {
            if (!mod) continue
            matchStore(store, mod)
            if (mod.default) matchStore(store, mod.default)
            try {
                for (const key in mod) {
                    if (store.Chat && store.Contact && store.Label) break
                    try {
                        const val = mod[key]
                        if (val && typeof val === 'object') matchStore(store, val)
                    } catch { }
                }
            } catch { }
        }
        return store
    }

    async function initStore(maxWait = 120000) {
        if (Store?.Chat) return Store

        const start = Date.now()
        while (Date.now() - start < maxWait) {
            // Wait for WhatsApp UI
            const uiReady = document.querySelector('#pane-side') || document.querySelector('[data-testid="qrcode"]') || document.querySelector('canvas')
            if (!uiReady) {
                await new Promise(r => setTimeout(r, 1000))
                continue
            }

            const modules = loadAllModules()
            if (modules && modules.length > 0) {
                const found = findStore(modules)
                if (found.Chat) {
                    Store = found
                    LOG(`Store ready ✓`, Object.keys(Store))
                    return Store
                }
            }

            // Not ready yet — reset cache and retry
            allModules = null
            await new Promise(r => setTimeout(r, 2000))
        }
        LOG('Store init timeout')
        return null
    }

    // ─── Utilities ───────────────────────────────────────────────────────────
    function phoneFromId(idObj) {
        if (!idObj) return null
        if (typeof idObj === 'string') {
            const match = idObj.match(/^(\d+)@/)
            return match ? `+${match[1]}` : null
        }
        if (idObj.user && /^\d+$/.test(idObj.user)) return `+${idObj.user}`
        if (idObj._serialized) {
            const match = idObj._serialized.match(/^(\d+)@/)
            return match ? `+${match[1]}` : null
        }
        return null
    }

    function getContactName(chat) {
        return (
            chat?.contact?.name ||
            chat?.contact?.pushname ||
            chat?.contact?.verifiedName ||
            chat?.contact?.formattedName ||
            chat?.name ||
            chat?.formattedTitle ||
            ''
        )
    }

    // ─── Public API ──────────────────────────────────────────────────────────
    window.NexorAPI = {
        async ping() {
            const s = Store?.Chat ? Store : await initStore(5000)
            return { ready: !!(s && s.Chat), hasLabels: !!(s && s.Label) }
        },

        async listGroups() {
            const s = Store?.Chat ? Store : await initStore()
            if (!s?.Chat) return { success: false, error: 'WhatsApp Web no está listo. Esperá a que cargue completamente.' }
            try {
                const chats = s.Chat.getModelsArray()
                const groups = chats
                    .filter(c => c.isGroup === true || (c.id?._serialized || '').endsWith('@g.us'))
                    .map(g => ({
                        id: g.id?._serialized || String(g.id),
                        name: g.formattedTitle || g.name || g.contact?.name || 'Sin nombre',
                        participantCount: g.groupMetadata?.participants?.length || g.groupMetadata?.participants?._models?.length || 0,
                    }))
                    .sort((a, b) => a.name.localeCompare(b.name))
                return { success: true, groups }
            } catch (err) {
                return { success: false, error: err.message || String(err) }
            }
        },

        async listLabels() {
            const s = Store?.Chat ? Store : await initStore()
            if (!s?.Label) return { success: false, error: 'Etiquetas no disponibles. Solo funciona con WhatsApp Business con etiquetas creadas.' }
            try {
                const labels = s.Label.getModelsArray().map(l => ({
                    id: String(l.id),
                    name: l.name || 'Sin nombre',
                    color: l.colorHex || l.color || 0,
                }))
                return { success: true, labels }
            } catch (err) {
                return { success: false, error: err.message || String(err) }
            }
        },

        async getGroupContacts(groupId) {
            const s = Store?.Chat ? Store : await initStore()
            if (!s?.Chat) return { success: false, error: 'Store no disponible' }
            try {
                const chat = s.Chat.get(groupId)
                if (!chat) return { success: false, error: 'Grupo no encontrado' }
                const participants = chat.groupMetadata?.participants
                const list = participants?._models || participants?.getModelsArray?.() || participants || []
                const contacts = []
                const seen = new Set()
                for (const p of list) {
                    const phone = phoneFromId(p.id)
                    if (!phone || seen.has(phone)) continue
                    seen.add(phone)
                    const contact = p.contact || s.Contact?.get?.(p.id)
                    const name = contact?.pushname || contact?.name || contact?.verifiedName || contact?.formattedName || ''
                    contacts.push({ phone, name })
                }
                return { success: true, contacts }
            } catch (err) {
                return { success: false, error: err.message || String(err) }
            }
        },

        async getLabelContacts(labelId) {
            const s = Store?.Chat ? Store : await initStore()
            if (!s?.Chat) return { success: false, error: 'Store no disponible' }
            try {
                const chats = s.Chat.getModelsArray()
                const contacts = []
                const seen = new Set()
                for (const chat of chats) {
                    const labelIds = chat.labels || chat.labelIds || []
                    const hasLabel = Array.isArray(labelIds) && labelIds.map(String).includes(String(labelId))
                    if (!hasLabel || chat.isGroup) continue
                    const phone = phoneFromId(chat.id)
                    if (!phone || seen.has(phone)) continue
                    seen.add(phone)
                    contacts.push({ phone, name: getContactName(chat) })
                }
                return { success: true, contacts }
            } catch (err) {
                return { success: false, error: err.message || String(err) }
            }
        },

        async listAllChats() {
            const s = Store?.Chat ? Store : await initStore()
            if (!s?.Chat) return { success: false, error: 'Store no disponible' }
            try {
                const chats = s.Chat.getModelsArray()
                const contacts = []
                const seen = new Set()
                for (const chat of chats) {
                    if (chat.isGroup) continue
                    const phone = phoneFromId(chat.id)
                    if (!phone || seen.has(phone)) continue
                    seen.add(phone)
                    contacts.push({ phone, name: getContactName(chat) })
                }
                return { success: true, contacts }
            } catch (err) {
                return { success: false, error: err.message || String(err) }
            }
        },
    }

    // Start init in background
    initStore()
    LOG('Nexor extractor loaded')
    return 'ok'
})()
