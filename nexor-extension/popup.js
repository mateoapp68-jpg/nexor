// Nexor Contacts Extractor — popup.js

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

let currentMode = null
let items = []
let filtered = []
let exportMode = 'phone'

function log(msg, type = '') {
    logEl.classList.add('show')
    const entry = document.createElement('div')
    entry.className = `log-entry ${type}`
    entry.textContent = `> ${msg}`
    logEl.appendChild(entry)
    logEl.scrollTop = logEl.scrollHeight
}
function clearLog() { logEl.innerHTML = ''; logEl.classList.remove('show') }

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

// ─── Tab communication ─────────────────────────────────────────────────────
async function callContent(action, params = {}, timeoutMs = 5 * 60 * 1000) {
    const [tab] = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' })
    if (!tab?.id) {
        return { success: false, error: 'Abrí web.whatsapp.com primero' }
    }
    const responsePromise = chrome.tabs.sendMessage(tab.id, { action, params }).catch(err => ({
        success: false,
        error: err?.message || 'Error de comunicación',
    }))
    const timeout = new Promise(r => setTimeout(() => r({ success: false, error: 'Timeout' }), timeoutMs))
    return Promise.race([responsePromise, timeout])
}

async function checkStatus() {
    const ping = await callContent('ping', {}, 10000)
    if (ping?.success && ping?.ready) {
        setStatus('ok', ping.hasLabels ? 'Conectado · Business' : 'Conectado ✓')
    } else if (ping?.error?.includes('web.whatsapp.com')) {
        setStatus('err', 'Abrí WhatsApp Web')
    } else {
        setStatus('loading', 'Esperando WhatsApp...')
        setTimeout(checkStatus, 3000)
    }
}

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
        log(`Error al descargar: ${err?.message}`, 'error')
        return false
    }
}

// ─── Load list ─────────────────────────────────────────────────────────────
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
        id: x.id,
        name: x.name,
        total: mode === 'groups' ? x.totalMembers : x.totalContacts,
        resolved: mode === 'groups' ? x.resolvedMembers : x.resolvedContacts,
        selected: false,
    }))
    filtered = [...items]
    renderItems()
}

function renderItems() {
    if (filtered.length === 0) {
        itemsList.innerHTML = `<div class="empty">${items.length === 0 ? 'Sin resultados' : 'No coincide con la búsqueda'}</div>`
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
        <div class="item-meta"><span class="resolved"></span><span class="unresolved"></span></div>
      </div>`
        div.querySelector('.item-name').textContent = item.name
        div.querySelector('.resolved').textContent = `${item.resolved} reales`
        const unr = item.total - item.resolved
        if (unr > 0) {
            div.querySelector('.unresolved').textContent = ` · ${unr} sin resolver`
        }
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

// Export mode radios
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

// Main menu buttons
btnGroups.addEventListener('click', () => loadList('groups'))
btnLabels.addEventListener('click', () => loadList('labels'))
btnAll.addEventListener('click', () => {
    clearLog()
    showView(viewAll)
})

// Export selected
btnExport.addEventListener('click', async () => {
    const selected = items.filter(i => i.selected)
    if (!selected.length) return
    btnExport.disabled = true
    clearLog()
    log(`Extrayendo ${selected.length} ${currentMode === 'groups' ? 'grupo(s)' : 'etiqueta(s)'}...`)

    const action = currentMode === 'groups' ? 'getGroupContacts' : 'getLabelContacts'
    const key = currentMode === 'groups' ? 'groupIds' : 'labelIds'
    const result = await callContent(action, { [key]: selected.map(s => s.id) })

    if (result?.success) {
        log(`${result.contacts.length} contactos reales`, 'success')
        const filename = currentMode === 'groups' ? 'nexor_grupos' : 'nexor_etiquetas'
        const ok = await downloadCsv(result.contacts, filename)
        if (ok) log('Descarga iniciada ✓', 'success')
    } else {
        log(result?.error || 'Error', 'error')
    }
    btnExport.disabled = false
})

// Export all chats
btnExportAll.addEventListener('click', async () => {
    btnExportAll.disabled = true
    clearLog()
    log('Extrayendo todos los chats...')
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
