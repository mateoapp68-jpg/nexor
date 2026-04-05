// Nexor WhatsApp Exporter — inject.js (v1.3.0)
// Runs in the MAIN world of web.whatsapp.com to access WhatsApp's internal Store.
// Hunts webpack modules to find Chat, Label, Contact APIs, then exposes them via postMessage.

(function () {
    if (window.__nexorInjectLoaded) return
    window.__nexorInjectLoaded = true

    const LOG = (...args) => console.log('[Nexor Inject]', ...args)

    let Store = null

    // ─── Webpack hunt ────────────────────────────────────────────────────────
    function huntStore() {
        const chunkKey = Object.keys(window).find(k => k.startsWith('webpackChunk'))
        if (!chunkKey) {
            LOG('webpackChunk not found yet')
            return null
        }

        const modules = []
        try {
            window[chunkKey].push([
                ['__nexor_hunt_' + Date.now()],
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
        } catch (e) {
            LOG('webpack push error:', e)
            return null
        }

        const found = {}
        for (const m of modules) {
            if (!m || typeof m !== 'object') continue

            // Direct properties
            if (m.Chat && typeof m.Chat.getModelsArray === 'function') found.Chat = m.Chat
            if (m.Contact && typeof m.Contact.getModelsArray === 'function') found.Contact = m.Contact
            if (m.Label && typeof m.Label.getModelsArray === 'function') found.Label = m.Label
            if (m.LabelAssociation) found.LabelAssociation = m.LabelAssociation
            if (m.GroupMetadata && typeof m.GroupMetadata.getModelsArray === 'function') found.GroupMetadata = m.GroupMetadata
            if (m.WidFactory) found.WidFactory = m.WidFactory

            // default export
            if (m.default) {
                const d = m.default
                if (d.Chat && typeof d.Chat.getModelsArray === 'function') found.Chat = d.Chat
                if (d.Contact && typeof d.Contact.getModelsArray === 'function') found.Contact = d.Contact
                if (d.Label && typeof d.Label.getModelsArray === 'function') found.Label = d.Label
                if (d.LabelAssociation) found.LabelAssociation = d.LabelAssociation
                if (d.GroupMetadata && typeof d.GroupMetadata.getModelsArray === 'function') found.GroupMetadata = d.GroupMetadata
            }
        }

        LOG(`Hunt found ${Object.keys(found).length} store modules:`, Object.keys(found))
        return Object.keys(found).length > 0 ? found : null
    }

    // ─── Keep trying to get Store ─────────────────────────────────────────────
    function tryInit() {
        const s = huntStore()
        if (s && s.Chat) {
            Store = s
            window.__nexorStore = Store
            LOG('Store ready ✓')
            return true
        }
        return false
    }

    // Try immediately + retry on interval until chats load
    if (!tryInit()) {
        const interval = setInterval(() => {
            if (tryInit()) clearInterval(interval)
        }, 2000)
        // Give up after 2 minutes
        setTimeout(() => clearInterval(interval), 120000)
    }

    // ─── Utility: extract phone from chat id ──────────────────────────────────
    function phoneFromId(idObj) {
        if (!idObj) return null
        if (typeof idObj === 'string') {
            const match = idObj.match(/^(\d+)@/)
            if (match) return `+${match[1]}`
            return null
        }
        // id object has .user or ._serialized
        if (idObj.user && /^\d+$/.test(idObj.user)) return `+${idObj.user}`
        if (idObj._serialized) {
            const match = idObj._serialized.match(/^(\d+)@/)
            if (match) return `+${match[1]}`
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
            return { success: true, ready: !!(Store && Store.Chat) }
        },

        async listGroups() {
            if (!Store?.Chat) return { success: false, error: 'Store no disponible. Esperá a que carguen los chats.' }
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
            if (!Store?.Chat) return { success: false, error: 'Store no disponible' }
            try {
                const chat = Store.Chat.get(groupId)
                if (!chat) return { success: false, error: `Grupo no encontrado: ${groupId}` }

                let participants = chat.groupMetadata?.participants
                // Some versions store as ._models, some as array
                const participantArray = participants?._models || participants?.getModelsArray?.() || participants || []

                const contacts = []
                const seen = new Set()
                for (const p of participantArray) {
                    const phone = phoneFromId(p.id)
                    if (!phone || seen.has(phone)) continue
                    seen.add(phone)
                    const contact = p.contact || Store.Contact?.get?.(p.id)
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
                    if (chat.isGroup) continue // Skip groups in label exports

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

    // ─── Message listener (postMessage from content script) ──────────────────
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

    LOG('Inject script v1.3.0 loaded in MAIN world')
})()
