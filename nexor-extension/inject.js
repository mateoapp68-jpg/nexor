// Nexor WhatsApp Exporter — inject.js (v1.3.1)
// Runs in MAIN world. Waits for WhatsApp to load, then hunts webpack for Store.
// Falls back to React fiber scraping if webpack hunt fails.

(function () {
    if (window.__nexorInjectLoaded) return
    window.__nexorInjectLoaded = true

    const LOG = (...args) => console.log('[Nexor Inject]', ...args)

    let Store = null
    let initPromise = null
    let allModules = null

    // ─── Wait for WhatsApp to be loaded ──────────────────────────────────────
    function waitForElement(selector, timeout = 120000) {
        return new Promise((resolve) => {
            if (document.querySelector(selector)) {
                resolve(true)
                return
            }
            const start = Date.now()
            const interval = setInterval(() => {
                if (document.querySelector(selector)) {
                    clearInterval(interval)
                    resolve(true)
                } else if (Date.now() - start > timeout) {
                    clearInterval(interval)
                    resolve(false)
                }
            }, 500)
        })
    }

    // ─── Webpack hunt ────────────────────────────────────────────────────────
    function loadAllModules() {
        if (allModules) return allModules

        const chunkKey = Object.keys(window).find(k =>
            k.startsWith('webpackChunk') || k.startsWith('webpackJsonp')
        )
        if (!chunkKey) {
            LOG('webpack chunk key not found. Available keys:', Object.keys(window).filter(k => k.toLowerCase().includes('webpack')))
            return null
        }

        LOG(`webpack chunk key: ${chunkKey}`)

        const chunkArray = window[chunkKey]
        if (!Array.isArray(chunkArray) || chunkArray.length === 0) {
            LOG('webpack chunk array empty or invalid')
            return null
        }

        const modules = []
        try {
            const markerId = 'nexor_' + Math.random().toString(36).slice(2)
            chunkArray.push([
                [markerId],
                {},
                function (e) {
                    // e is __webpack_require__
                    // Iterate module factories and call each
                    for (const id in e.m) {
                        try {
                            const mod = e(id)
                            if (mod) modules.push(mod)
                        } catch { }
                    }
                },
            ])
        } catch (err) {
            LOG('webpack push error:', err)
            return null
        }

        LOG(`Loaded ${modules.length} webpack modules`)
        if (modules.length > 0) allModules = modules
        return modules
    }

    function matchStore(store, obj) {
        if (!obj || typeof obj !== 'object') return

        // Chat collection
        if (!store.Chat && obj.Chat && typeof obj.Chat.getModelsArray === 'function') {
            store.Chat = obj.Chat
        }
        if (!store.Chat && obj.getModelsArray && obj.get && obj.add && obj.remove) {
            // Could be Chat collection directly
            const arr = obj.getModelsArray()
            if (arr && arr[0] && (arr[0].id || arr[0].jid)) {
                store.Chat = obj
            }
        }

        // Contact collection
        if (!store.Contact && obj.Contact && typeof obj.Contact.getModelsArray === 'function') {
            store.Contact = obj.Contact
        }

        // Label collection (Business)
        if (!store.Label && obj.Label && typeof obj.Label.getModelsArray === 'function') {
            store.Label = obj.Label
        }

        // Group metadata
        if (!store.GroupMetadata && obj.GroupMetadata && typeof obj.GroupMetadata.getModelsArray === 'function') {
            store.GroupMetadata = obj.GroupMetadata
        }
    }

    function findStore(modules) {
        const store = {}
        for (const mod of modules) {
            if (!mod) continue
            matchStore(store, mod)
            if (mod.default) matchStore(store, mod.default)
            // Also scan exported sub-objects
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

    async function init() {
        if (initPromise) return initPromise
        initPromise = (async () => {
            LOG('v1.3.1 starting — waiting for WhatsApp to load...')

            // Wait for either chat list pane or QR code to appear (WA loaded)
            await waitForElement('#pane-side, [data-testid="qrcode"], canvas[aria-label*="QR"]')
            LOG('WhatsApp UI detected, waiting 3s for webpack...')
            await new Promise(r => setTimeout(r, 3000))

            // Try to load modules
            let modules = loadAllModules()
            let retries = 0
            while ((!modules || modules.length === 0) && retries < 30) {
                await new Promise(r => setTimeout(r, 2000))
                modules = loadAllModules()
                retries++
            }

            if (!modules || modules.length === 0) {
                LOG('Failed to load webpack modules after 60s')
                return null
            }

            // Find store
            const found = findStore(modules)
            LOG('Store search result:', Object.keys(found))

            if (!found.Chat) {
                LOG('Store.Chat not found in any module. Dumping first 5 module shapes:')
                for (let i = 0; i < Math.min(5, modules.length); i++) {
                    const m = modules[i]
                    LOG(`  module ${i}:`, m ? Object.keys(m).slice(0, 20) : 'null')
                }
                return null
            }

            Store = found
            window.__nexorStore = Store
            LOG('Store ready ✓', Object.keys(Store))
            return Store
        })()
        return initPromise
    }

    // Kick off init immediately (it waits internally)
    init()

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

    // ─── API handlers ─────────────────────────────────────────────────────────
    const handlers = {
        async ping() {
            await init()
            return { success: true, ready: !!(Store && Store.Chat), hasLabels: !!(Store && Store.Label) }
        },

        async listGroups() {
            await init()
            if (!Store?.Chat) return { success: false, error: 'WhatsApp aún no cargó completamente. Esperá unos segundos e intentá de nuevo.' }
            try {
                const chats = Store.Chat.getModelsArray()
                LOG(`Total chats: ${chats.length}`)
                const groups = chats
                    .filter(c => {
                        if (c.isGroup === true) return true
                        const serialized = c.id?._serialized || ''
                        return serialized.endsWith('@g.us')
                    })
                    .map(g => ({
                        id: g.id?._serialized || String(g.id),
                        name: g.formattedTitle || g.name || g.contact?.name || 'Sin nombre',
                        participantCount: g.groupMetadata?.participants?.length || g.groupMetadata?.participants?._models?.length || 0,
                    }))
                    .sort((a, b) => a.name.localeCompare(b.name))
                LOG(`Groups: ${groups.length}`)
                return { success: true, groups }
            } catch (err) {
                LOG('listGroups error:', err)
                return { success: false, error: err.message || String(err) }
            }
        },

        async listLabels() {
            await init()
            if (!Store?.Label) return { success: false, error: 'Etiquetas no disponibles. Solo funciona con WhatsApp Business con etiquetas creadas.' }
            try {
                const labels = Store.Label.getModelsArray().map(l => ({
                    id: String(l.id),
                    name: l.name || 'Sin nombre',
                    color: l.colorHex || l.color || 0,
                }))
                LOG(`Labels: ${labels.length}`)
                return { success: true, labels }
            } catch (err) {
                LOG('listLabels error:', err)
                return { success: false, error: err.message || String(err) }
            }
        },

        async getGroupContacts({ groupId }) {
            await init()
            if (!Store?.Chat) return { success: false, error: 'Store no disponible' }
            try {
                const chat = Store.Chat.get(groupId)
                if (!chat) return { success: false, error: `Grupo no encontrado: ${groupId}` }

                let participants = chat.groupMetadata?.participants
                const participantArray = participants?._models || participants?.getModelsArray?.() || participants || []

                const contacts = []
                const seen = new Set()
                for (const p of participantArray) {
                    const phone = phoneFromId(p.id)
                    if (!phone || seen.has(phone)) continue
                    seen.add(phone)
                    const contact = p.contact || (Store.Contact?.get?.(p.id))
                    const name = contact?.pushname || contact?.name || contact?.verifiedName || contact?.formattedName || ''
                    contacts.push({ phone, name })
                }
                return { success: true, contacts }
            } catch (err) {
                LOG('getGroupContacts error:', err)
                return { success: false, error: err.message || String(err) }
            }
        },

        async getLabelContacts({ labelId }) {
            await init()
            if (!Store?.Chat) return { success: false, error: 'Store no disponible' }
            try {
                const chats = Store.Chat.getModelsArray()
                const contacts = []
                const seen = new Set()
                for (const chat of chats) {
                    const labelIds = chat.labels || chat.labelIds || []
                    const hasLabel = Array.isArray(labelIds)
                        ? labelIds.map(String).includes(String(labelId))
                        : false
                    if (!hasLabel) continue
                    if (chat.isGroup) continue
                    const phone = phoneFromId(chat.id)
                    if (!phone || seen.has(phone)) continue
                    seen.add(phone)
                    contacts.push({ phone, name: getContactName(chat) })
                }
                return { success: true, contacts }
            } catch (err) {
                LOG('getLabelContacts error:', err)
                return { success: false, error: err.message || String(err) }
            }
        },

        async listAllChats() {
            await init()
            if (!Store?.Chat) return { success: false, error: 'Store no disponible' }
            try {
                const chats = Store.Chat.getModelsArray()
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
                LOG('listAllChats error:', err)
                return { success: false, error: err.message || String(err) }
            }
        },
    }

    // ─── Message listener ────────────────────────────────────────────────────
    window.addEventListener('message', async (event) => {
        if (event.source !== window) return
        const data = event.data
        if (!data || data.type !== 'NEXOR_REQUEST') return

        const { id, action, params } = data
        const handler = handlers[action]

        const respond = (result) => {
            window.postMessage({ type: 'NEXOR_RESPONSE', id, result }, '*')
        }

        if (!handler) {
            respond({ success: false, error: `Acción desconocida: ${action}` })
            return
        }

        try {
            const result = await handler(params || {})
            respond(result)
        } catch (err) {
            respond({ success: false, error: err?.message || String(err) })
        }
    })

    LOG('Inject script v1.3.1 loaded in MAIN world')
})()
