// Nexor Contacts Extractor — popup.js (v3.0.0)

const $ = (id) => document.getElementById(id)

const statusEl = $('status')
const statusText = $('statusText')
const logEl = $('log')
const backBtn = $('backBtn')

const viewMain = $('viewMain')
const viewSelect = $('viewSelect')
const viewAll = $('viewAll')

const btnGroups = $('btnGroups')
const btnLabels = $('btnLabels')
const btnAll = $('btnAll')
const btnExport = $('btnExport')
const btnExportAll = $('btnExportAll')
const selectAllBtn = $('selectAllBtn')
const searchInput = $('searchInput')
const itemsList = $('itemsList')

let currentMode = null // 'groups' | 'labels'
let items = []
let filtered = []
let exportMode = 'phone'

// ─── Logging ───────────────────────────────────────────────────────────────
function log(msg, type = '') {
    logEl.classList.add('show')
    const entry = document.createElement('div')
    entry.className = `log-entry ${type}`
    entry.textContent = `> ${msg}`
    logEl.appendChild(entry)
    logEl.scrollTop = logEl.scrollHeight
}
function clearLog() { logEl.innerHTML = ''; logEl.classList.remove('show') }

// ─── Views ─────────────────────────────────────────────────────────────────
function showView(view) {
    viewMain.classList.remove('active')
    viewSelect.classList.remove('active')
    viewAll.classList.remove('active')
    view.classList.add('active')
    backBtn.style.display = view === viewMain ? 'none' : 'block'
}

function setStatus(state, label) {
    statusEl.className = `status ${state}`
    statusText.textContent = label
    const enabled = state === 'ok'
    btnGroups.disabled = !enabled
    btnLabels.disabled = !enabled
    btnAll.disabled = !enabled
}

backBtn.addEventListener('click', () => {
    showView(viewMain)
    currentMode = null
    items = []; filtered = []
    clearLog()
})

// ─── Communication ─────────────────────────────────────────────────────────
async function findWhatsAppTab() {
    const tabs = await chrome.tabs.query({})
    return tabs.find(t => t.url?.includes('web.whatsapp.com')) || null
}

async function callContent(action, params = {}, timeoutMs = 10 * 60 * 1000) {
    const tab = await findWhatsAppTab()
    if (!tab?.id) {
        return { success: false, error: 'NO_WA_TAB' }
    }
    try {
        const responsePromise = chrome.tabs.sendMessage(tab.id, { action, params })
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)
        )
        return await Promise.race([responsePromise, timeoutPromise])
    } catch (err) {
        const msg = err?.message || String(err)
        if (msg.includes('Could not establish connection') || msg.includes('receiving end')) {
            return { success: false, error: 'NO_CONTENT_SCRIPT' }
        }
        return { success: false, error: msg }
    }
}

let checkAttempts = 0
let pollTimer = null
let autoActionTaken = false

async function checkStatus() {
    checkAttempts++
    const ping = await callContent('ping', {}, 3000)

    if (ping?.success && ping?.ready) {
        setStatus('ok', 'Conectado a WhatsApp Web ✓')
        return
    }

    if (ping?.error === 'NO_WA_TAB') {
        if (!autoActionTaken) {
            autoActionTaken = true
            setStatus('loading', 'Abriendo WhatsApp Web...')
            await chrome.tabs.create({ url: 'https://web.whatsapp.com/', active: true })
            pollTimer = setTimeout(checkStatus, 3000)
            return
        }
        setStatus('err', 'Escaneá el QR en WhatsApp Web')
        pollTimer = setTimeout(checkStatus, 2000)
        return
    }

    if (ping?.error === 'NO_CONTENT_SCRIPT') {
        if (!autoActionTaken) {
            autoActionTaken = true
            setStatus('loading', 'Inyectando script...')
            const tab = await findWhatsAppTab()
            if (tab?.id) {
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['content.js'],
                    })
                } catch (err) {
                    log('Inject error: ' + (err?.message || err), 'error')
                }
            }
            pollTimer = setTimeout(checkStatus, 2000)
            return
        }
        setStatus('err', 'Recargá WhatsApp Web (Ctrl+Shift+R)')
        pollTimer = setTimeout(checkStatus, 3000)
        return
    }

    // Still loading
    if (checkAttempts < 30) {
        setStatus('loading', `Esperando... ${checkAttempts}`)
        pollTimer = setTimeout(checkStatus, 2000)
    } else {
        setStatus('err', 'Recargá WhatsApp Web manualmente')
    }
}

window.addEventListener('unload', () => {
    if (pollTimer) clearTimeout(pollTimer)
})

// ─── CSV download ──────────────────────────────────────────────────────────
async function downloadCsv(rows, filename) {
    if (!rows?.length) { log('Sin contactos para descargar', 'error'); return false }
    const includeName = exportMode === 'phone_name'
    const headers = includeName ? ['Teléfono', 'Nombre'] : ['Teléfono']
    const lines = [headers.join(',')]
    for (const r of rows) {
        const cells = [`"${(r.phone || '').replace(/"/g, '""')}"`]
        if (includeName) cells.push(`"${(r.name || '').replace(/"/g, '""')}"`)
        lines.push(cells.join(','))
    }
    const bom = '\ufeff'
    const blob = new Blob([bom + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    try {
        await chrome.downloads.download({
            url,
            filename: `${filename}_${Date.now()}.csv`,
            saveAs: true,
        })
        setTimeout(() => URL.revokeObjectURL(url), 2000)
        return true
    } catch (err) {
        log(`Error: ${err?.message}`, 'error')
        return false
    }
}

// ─── Load list (groups or labels) ──────────────────────────────────────────
async function loadList(mode) {
    currentMode = mode
    items = []; filtered = []
    searchInput.value = ''
    clearLog()
    showView(viewSelect)
    itemsList.innerHTML = '<div class="empty">Cargando...</div>'
    btnExport.disabled = true

    const action = mode === 'groups' ? 'listGroups' : 'listLabels'
    const result = await callContent(action, {}, 60000)

    if (!result?.success) {
        itemsList.innerHTML = `<div class="empty">${result?.error || 'Error'}</div>`
        return
    }

    const list = mode === 'groups' ? result.groups : result.labels
    items = (list || []).map(x => ({
        index: x.index,
        name: x.name,
        selected: false,
    }))
    filtered = [...items]
    renderItems()
}

function renderItems() {
    if (filtered.length === 0) {
        itemsList.innerHTML = `<div class="empty">${items.length === 0 ? 'Sin resultados' : 'Sin coincidencias'}</div>`
        btnExport.disabled = true
        return
    }
    itemsList.innerHTML = ''
    filtered.forEach((item) => {
        const div = document.createElement('div')
        div.className = `item ${item.selected ? 'selected' : ''}`
        div.innerHTML = `
      <div class="checkbox">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <div class="item-body">
        <div class="item-name"></div>
      </div>`
        div.querySelector('.item-name').textContent = item.name
        div.addEventListener('click', () => {
            item.selected = !item.selected
            renderItems()
        })
        itemsList.appendChild(div)
    })
    const anySelected = items.some(i => i.selected)
    btnExport.disabled = !anySelected
    selectAllBtn.textContent = items.every(i => i.selected) ? 'Ninguno' : 'Todos'
}

searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase().trim()
    filtered = q ? items.filter(i => i.name.toLowerCase().includes(q)) : [...items]
    renderItems()
})

selectAllBtn.addEventListener('click', () => {
    const all = items.every(i => i.selected)
    items.forEach(i => i.selected = !all)
    renderItems()
})

document.querySelectorAll('.radio[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.radio[data-mode]').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        exportMode = btn.dataset.mode
    })
})
document.querySelectorAll('.radio[data-mode-all]').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.radio[data-mode-all]').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        exportMode = btn.dataset.modeAll
    })
})

btnGroups.addEventListener('click', () => loadList('groups'))
btnLabels.addEventListener('click', () => loadList('labels'))
btnAll.addEventListener('click', () => {
    clearLog()
    showView(viewAll)
})

// ─── Export selected groups/labels ─────────────────────────────────────────
btnExport.addEventListener('click', async () => {
    const selected = items.filter(i => i.selected)
    if (!selected.length) return
    btnExport.disabled = true
    clearLog()

    if (currentMode === 'groups') {
        log(`Extrayendo ${selected.length} grupo(s)...`)
        log('⚠️ Esto puede tardar varios minutos — la extensión abre cada grupo y hace scroll')
        const result = await callContent('getGroupContacts', {
            groupIndexes: selected.map(s => s.index),
            groupNames: selected.map(s => s.name),
        })
        if (result?.success) {
            log(`${result.contacts.length} contactos extraídos`, 'success')
            const ok = await downloadCsv(result.contacts, 'nexor_grupos')
            if (ok) log('Descarga iniciada ✓', 'success')
        } else {
            log(result?.error || 'Error', 'error')
        }
    } else {
        log(`Extrayendo ${selected.length} etiqueta(s)...`)
        const result = await callContent('getLabelContacts', {
            labelNames: selected.map(s => s.name),
        })
        if (result?.success) {
            log(`${result.contacts.length} contactos extraídos`, 'success')
            const ok = await downloadCsv(result.contacts, 'nexor_etiquetas')
            if (ok) log('Descarga iniciada ✓', 'success')
        } else {
            log(result?.error || 'Error', 'error')
        }
    }
    btnExport.disabled = false
})

// ─── Export all chats ──────────────────────────────────────────────────────
btnExportAll.addEventListener('click', async () => {
    btnExportAll.disabled = true
    clearLog()
    log('Extrayendo todos los chats...')
    log('⚠️ Tarda varios minutos — abre cada chat uno por uno')
    const result = await callContent('listAllChats', {})
    if (result?.success) {
        log(`${result.contacts.length} contactos`, 'success')
        const ok = await downloadCsv(result.contacts, 'nexor_chats')
        if (ok) log('Descarga iniciada ✓', 'success')
    } else {
        log(result?.error || 'Error', 'error')
    }
    btnExportAll.disabled = false
})

checkStatus()
