// Nexor Contacts Extractor — inject.js (v2.0.0)
// Runs in MAIN world at document_start on web.whatsapp.com
// Uses the wa-js technique: hook webpackChunk BEFORE WhatsApp initializes,
// then capture __webpack_require__ when webpack processes our chunk.

(function () {
    if (window.__nexor_inject) return
    window.__nexor_inject = true

    const TAG = '[Nexor]'
    const log = (...args) => console.log(TAG, ...args)

    let Store = null
    let initPromise = null

    // ─── Wait helper ──────────────────────────────────────────────────────────
    function waitFor(predicate, timeout = 120000, interval = 200) {
        return new Promise((resolve) => {
            const start = Date.now()
            const tick = () => {
                try {
                    if (predicate()) return resolve(true)
                } catch { }
                if (Date.now() - start > timeout) return resolve(false)
                setTimeout(tick, interval)
            }
            tick()
        })
    }

    // ─── Store recursive scanner ──────────────────────────────────────────────
    function scanForStore(mod, store, depth = 0) {
        if (depth > 3 || !mod || typeof mod !== 'object') return

        // Direct check
        try {
            if (mod.Chat && typeof mod.Chat.getModelsArray === 'function' && !store.Chat) {
                store.Chat = mod.Chat
            }
            if (mod.Contact && typeof mod.Contact.getModelsArray === 'function' && !store.Contact) {
                store.Contact = mod.Contact
            }
            if (mod.Label && typeof mod.Label.getModelsArray === 'function' && !store.Label) {
                store.Label = mod.Label
            }
            if (mod.GroupMetadata && typeof mod.GroupMetadata.getModelsArray === 'function' && !store.GroupMetadata) {
                store.GroupMetadata = mod.GroupMetadata
            }
            if (mod.LabelAssociation && !store.LabelAssociation) {
                store.LabelAssociation = mod.LabelAssociation
            }
        } catch { }

        // Default export
        if (mod.default && mod.default !== mod) {
            scanForStore(mod.default, store, depth + 1)
        }

        // Limited recursive search into sub-objects
        if (depth < 2) {
            for (const key in mod) {
                if (store.Chat && store.Contact && store.Label && store.GroupMetadata) return
                try {
                    const val = mod[key]
                    if (val && typeof val === 'object' && val !== mod) {
                        scanForStore(val, store, depth + 1)
                    }
                } catch { }
            }
        }
    }

    // ─── Webpack hook (the wa-js technique) ──────────────────────────────────
    async function initStore() {
        if (Store) return Store

        log('Initializing...')

        // Wait for WhatsApp to be loaded (QR visible or chat list)
        await waitFor(() => {
            return document.querySelector('#pane-side') ||
                document.querySelector('[data-testid="qrcode"]') ||
                document.querySelector('canvas') ||
                document.querySelector('[data-ref]')
        }, 120000)

        // Wait for webpack chunks to exist
        const chunkName = 'webpackChunkwhatsapp_web_client'
        const ready = await waitFor(() => {
            const arr = self[chunkName]
            return arr && Array.isArray(arr) && arr.length > 0
        }, 60000)

        if (!ready) {
            log('webpackChunk never initialized')
            return null
        }

        log('webpackChunk found with', self[chunkName].length, 'chunks')

        // Push our own chunk to capture __webpack_require__
        let webpackRequire = null
        try {
            await new Promise((resolve) => {
                const id = 'nexor_hook_' + Date.now()
                self[chunkName].push([
                    [id],
                    {},
                    (r) => {
                        webpackRequire = r
                        resolve()
                    },
                ])
                // Fallback timeout
                setTimeout(resolve, 5000)
            })
        } catch (err) {
            log('push error:', err)
        }

        if (!webpackRequire) {
            log('Failed to capture webpack require')
            return null
        }

        log('Got webpack require with cache size:', Object.keys(webpackRequire.c || {}).length)

        const store = {}

        // Phase 1: Scan ALREADY-LOADED modules from cache (safest)
        for (const id in webpackRequire.c) {
            try {
                const mod = webpackRequire.c[id]?.exports
                scanForStore(mod, store)
            } catch { }
        }

        log('After cache scan:', Object.keys(store))

        // Phase 2: If incomplete, try loading from factories
        if (!store.Chat || !store.Label) {
            for (const id in webpackRequire.m) {
                if (store.Chat && store.Label && store.Contact) break
                try {
                    const mod = webpackRequire(id)
                    scanForStore(mod, store)
                } catch { }
            }
        }

        log('Final store:', Object.keys(store))

        if (store.Chat) {
            Store = store
            window.__nexor_store = Store
            return Store
        }

        return null
    }

    function getStore() {
        if (Store) return Promise.resolve(Store)
        if (!initPromise) initPromise = initStore()
        return initPromise
    }

    // Start init as soon as possible
    getStore()

    // ─── Helper: phone from id ────────────────────────────────────────────────
    function phoneFromId(idObj) {
        if (!idObj) return null
        let serialized = ''
        if (typeof idObj === 'string') serialized = idObj
        else if (idObj._serialized) serialized = idObj._serialized
        else if (idObj.user) serialized = `${idObj.user}@${idObj.server || 's.whatsapp.net'}`

        if (!serialized) return null
        if (serialized.endsWith('@s.whatsapp.net')) {
            const match = serialized.match(/^(\d+)/)
            if (match && match[1].length >= 8) return `+${match[1]}`
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
            const s = await getStore()
            return {
                success: true,
                ready: !!(s && s.Chat),
                hasLabels: !!(s && s.Label),
            }
        },

        async listGroups() {
            const s = await getStore()
            if (!s?.Chat) return { success: false, error: 'WhatsApp Web no cargó completamente' }
            try {
                const chats = s.Chat.getModelsArray()
                const groups = chats
                    .filter(c => c.isGroup === true || (c.id?._serialized || '').endsWith('@g.us'))
                    .map(g => {
                        const participants = g.groupMetadata?.participants
                        const pArr = participants?._models || participants?.getModelsArray?.() || participants || []
                        let resolved = 0
                        for (const p of pArr) {
                            if (phoneFromId(p.id)) resolved++
                        }
                        return {
                            id: g.id?._serialized || String(g.id),
                            name: g.formattedTitle || g.name || g.contact?.name || 'Sin nombre',
                            totalMembers: pArr.length,
                            resolvedMembers: resolved,
                        }
                    })
                    .sort((a, b) => a.name.localeCompare(b.name))
                return { success: true, groups }
            } catch (err) {
                return { success: false, error: err.message || String(err) }
            }
        },

        async listLabels() {
            const s = await getStore()
            if (!s?.Label) {
                return { success: false, error: 'No se encontraron etiquetas. Requiere WhatsApp Business.' }
            }
            try {
                const chats = s.Chat.getModelsArray()
                const labels = s.Label.getModelsArray().map(l => {
                    const id = String(l.id)
                    const labeledChats = chats.filter(c => {
                        const lids = c.labels || c.labelIds || []
                        return Array.isArray(lids) && lids.map(String).includes(id)
                    })
                    let resolved = 0
                    for (const c of labeledChats) {
                        if (phoneFromId(c.id)) resolved++
                    }
                    return {
                        id,
                        name: l.name || 'Sin nombre',
                        color: l.colorHex || l.color || 0,
                        totalContacts: labeledChats.length,
                        resolvedContacts: resolved,
                    }
                })
                return { success: true, labels }
            } catch (err) {
                return { success: false, error: err.message || String(err) }
            }
        },

        async getGroupContacts({ groupIds }) {
            const s = await getStore()
            if (!s?.Chat) return { success: false, error: 'Store no disponible' }
            try {
                const contacts = []
                const seen = new Set()
                for (const groupId of groupIds || []) {
                    const chat = s.Chat.get(groupId)
                    if (!chat) continue
                    const groupName = chat.formattedTitle || chat.name || 'Grupo'
                    const participants = chat.groupMetadata?.participants
                    const pArr = participants?._models || participants?.getModelsArray?.() || participants || []
                    for (const p of pArr) {
                        const phone = phoneFromId(p.id)
                        if (!phone) continue
                        const key = `${groupId}:${phone}`
                        if (seen.has(key)) continue
                        seen.add(key)
                        const contact = p.contact || s.Contact?.get?.(p.id)
                        const name = contact?.pushname || contact?.name || contact?.verifiedName || ''
                        contacts.push({ phone, name, source: `Grupo: ${groupName}` })
                    }
                }
                return { success: true, contacts }
            } catch (err) {
                return { success: false, error: err.message || String(err) }
            }
        },

        async getLabelContacts({ labelIds }) {
            const s = await getStore()
            if (!s?.Chat || !s?.Label) return { success: false, error: 'Store no disponible' }
            try {
                const contacts = []
                const seen = new Set()
                const allChats = s.Chat.getModelsArray()
                const allLabels = s.Label.getModelsArray()
                const labelNameById = new Map(allLabels.map(l => [String(l.id), l.name || 'Etiqueta']))

                for (const labelId of labelIds || []) {
                    const labelName = labelNameById.get(String(labelId)) || 'Etiqueta'
                    for (const chat of allChats) {
                        if (chat.isGroup) continue
                        const lids = chat.labels || chat.labelIds || []
                        if (!Array.isArray(lids) || !lids.map(String).includes(String(labelId))) continue
                        const phone = phoneFromId(chat.id)
                        if (!phone) continue
                        const key = `${labelId}:${phone}`
                        if (seen.has(key)) continue
                        seen.add(key)
                        contacts.push({
                            phone,
                            name: getContactName(chat),
                            source: `Etiqueta: ${labelName}`,
                        })
                    }
                }
                return { success: true, contacts }
            } catch (err) {
                return { success: false, error: err.message || String(err) }
            }
        },

        async listAllChats() {
            const s = await getStore()
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
                    contacts.push({ phone, name: getContactName(chat), source: 'Chat' })
                }
                return { success: true, contacts }
            } catch (err) {
                return { success: false, error: err.message || String(err) }
            }
        },
    }

    // ─── Message bridge (MAIN world ↔ ISOLATED content script) ───────────────
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

    log('inject.js v2.0.0 loaded')
})()
