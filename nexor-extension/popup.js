// Nexor WhatsApp Exporter — popup script (v1.3.0)

const $ = (id) => document.getElementById(id)

const statusEl = $('status')
const statusText = $('statusText')
const logEl = $('log')
const backBtn = $('backBtn')

const viewMain = $('viewMain')
const viewSelect = $('viewSelect')
const viewAll = $('viewAll')
const viewTitle = $('viewTitle')
const viewSubtitle = $('viewSubtitle')

const btnGroups = $('btnGroups')
const btnLabels = $('btnLabels')
const btnAll = $('btnAll')
const btnExport = $('btnExport')
const btnExportAll = $('btnExportAll')
const selectAllBtn = $('selectAll')
const listLabel = $('listLabel')
const itemsList = $('itemsList')
const loadingList = $('loadingList')
const listContent = $('listContent')

// State
let currentMode = null // 'groups' | 'labels'
let items = [] // [{ id, name, selected, ...extras }]
let exportMode = 'phone' // 'phone' | 'phone_name'

// ─── Views ─────────────────────────────────────────────────────────────────
function showView(view) {
    viewMain.classList.remove('active')
    viewSelect.classList.remove('active')
    viewAll.classList.remove('active')
    view.classList.add('active')

    if (view === viewMain) {
        backBtn.style.display = 'none'
        viewTitle.textContent = 'Nexor WhatsApp Exporter'
        viewSubtitle.textContent = 'Exportar contactos a Excel'
    } else {
        backBtn.style.display = 'flex'
    }
}

backBtn.addEventListener('click', () => {
    showView(viewMain)
    currentMode = null
    items = []
})

// ─── Logging ───────────────────────────────────────────────────────────────
function log(msg, type = '') {
    logEl.classList.add('show')
    const entry = document.createElement('div')
    entry.className = `log-entry ${type}`
    entry.textContent = `> ${msg}`
    logEl.appendChild(entry)
    logEl.scrollTop = logEl.scrollHeight
}

function clearLog() {
    logEl.innerHTML = ''
    logEl.classList.remove('show')
}

// ─── WhatsApp check ─────────────────────────────────────────────────────────
async function checkWhatsApp() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        if (!tab?.url?.includes('web.whatsapp.com')) {
            statusText.textContent = 'Abrí web.whatsapp.com primero'
            return false
        }
        // Also ping the inject script to verify Store is ready
        const ping = await sendCommand({ command: 'ping' }, 8000)
        if (!ping?.success || !ping?.ready) {
            statusEl.classList.remove('ok')
            statusEl.classList.add('err')
            statusText.textContent = 'Cargando WhatsApp... esperá unos segundos'
            setTimeout(checkWhatsApp, 3000)
            return false
        }
        statusEl.classList.remove('err')
        statusEl.classList.add('ok')
        statusText.textContent = 'Conectado a WhatsApp Web ✓'
        btnGroups.disabled = false
        btnLabels.disabled = false
        btnAll.disabled = false
        return true
    } catch {
        statusText.textContent = 'Error al verificar pestaña'
        return false
    }
}

// ─── Send command ──────────────────────────────────────────────────────────
async function sendCommand(payload, timeoutMs = 5 * 60 * 1000) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) {
        return { success: false, error: 'No se encontró la pestaña activa' }
    }

    const responsePromise = chrome.tabs.sendMessage(tab.id, payload).catch(err => {
        return { success: false, error: err?.message || 'Error de comunicación' }
    })

    const timeoutPromise = new Promise(resolve => {
        setTimeout(() => resolve({ success: false, error: `Timeout — recargá WhatsApp Web` }), timeoutMs)
    })

    return Promise.race([responsePromise, timeoutPromise])
}

// ─── CSV download ──────────────────────────────────────────────────────────
async function downloadCsv(rows, filename) {
    if (!rows || rows.length === 0) {
        log('No hay contactos para descargar', 'error')
        return false
    }
    try {
        const includeName = exportMode === 'phone_name'
        const headers = includeName ? ['Teléfono', 'Nombre'] : ['Teléfono']
        const csv = [headers.join(',')]
        for (const row of rows) {
            const cells = [`"${(row.phone || '').replace(/"/g, '""')}"`]
            if (includeName) {
                cells.push(`"${(row.name || '').replace(/"/g, '""')}"`)
            }
            csv.push(cells.join(','))
        }
        const bom = '\ufeff'
        const blob = new Blob([bom + csv.join('\n')], { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        await chrome.downloads.download({
            url,
            filename: `${filename}_${Date.now()}.csv`,
            saveAs: true,
        })
        setTimeout(() => URL.revokeObjectURL(url), 2000)
        return true
    } catch (err) {
        log(`Error al descargar: ${err?.message || err}`, 'error')
        return false
    }
}

// ─── Load list (groups or labels) ──────────────────────────────────────────
async function loadList(mode) {
    currentMode = mode
    items = []
    clearLog()

    if (mode === 'groups') {
        viewTitle.textContent = 'Exportar grupos'
        viewSubtitle.textContent = 'Seleccioná los grupos a exportar'
        listLabel.textContent = 'Grupos disponibles'
    } else {
        viewTitle.textContent = 'Exportar etiquetas'
        viewSubtitle.textContent = 'Seleccioná las etiquetas a exportar'
        listLabel.textContent = 'Etiquetas disponibles'
    }

    showView(viewSelect)
    loadingList.style.display = 'flex'
    listContent.style.display = 'none'
    btnExport.disabled = true

    const command = mode === 'groups' ? 'listGroups' : 'listLabels'
    const result = await sendCommand({ command }, 30 * 1000)

    loadingList.style.display = 'none'

    if (!result?.success) {
        itemsList.innerHTML = `<div class="empty">${result?.error || 'Error desconocido'}</div>`
        listContent.style.display = 'block'
        return
    }

    const list = mode === 'groups' ? (result.groups || []) : (result.labels || [])
    items = list.map(x => ({
        id: x.id,
        name: x.name,
        extra: mode === 'groups' ? `${x.participantCount || 0} miembros` : '',
        selected: false,
    }))
    renderItems()
    listContent.style.display = 'block'
}

// ─── Render item list ──────────────────────────────────────────────────────
function renderItems() {
    if (items.length === 0) {
        const msg = currentMode === 'groups' ? 'No se encontraron grupos' : 'No se encontraron etiquetas'
        itemsList.innerHTML = `<div class="empty">${msg}</div>`
        btnExport.disabled = true
        return
    }

    itemsList.innerHTML = ''
    items.forEach((item, idx) => {
        const div = document.createElement('div')
        div.className = `item ${item.selected ? 'selected' : ''}`
        div.innerHTML = `
      <div class="checkbox">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <div style="flex:1;min-width:0">
        <div class="item-name"></div>
        ${item.extra ? `<div style="font-size:9px;color:rgba(255,255,255,0.35);margin-top:2px" class="item-extra"></div>` : ''}
      </div>
    `
        div.querySelector('.item-name').textContent = item.name
        const extra = div.querySelector('.item-extra')
        if (extra) extra.textContent = item.extra
        div.addEventListener('click', () => {
            items[idx].selected = !items[idx].selected
            renderItems()
        })
        itemsList.appendChild(div)
    })

    const anySelected = items.some(i => i.selected)
    btnExport.disabled = !anySelected
    const allSelected = items.every(i => i.selected)
    selectAllBtn.textContent = allSelected ? 'Quitar todos' : 'Seleccionar todos'
}

selectAllBtn.addEventListener('click', () => {
    const allSelected = items.every(i => i.selected)
    items = items.map(i => ({ ...i, selected: !allSelected }))
    renderItems()
})

// ─── Export mode radios ────────────────────────────────────────────────────
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

// ─── Main menu buttons ─────────────────────────────────────────────────────
btnGroups.addEventListener('click', () => loadList('groups'))
btnLabels.addEventListener('click', () => loadList('labels'))
btnAll.addEventListener('click', () => {
    viewTitle.textContent = 'Exportar todos los chats'
    viewSubtitle.textContent = 'Lista completa de contactos'
    clearLog()
    showView(viewAll)
})

// ─── Export selected (groups or labels) ────────────────────────────────────
btnExport.addEventListener('click', async () => {
    const selected = items.filter(i => i.selected)
    if (selected.length === 0) return

    btnExport.disabled = true
    clearLog()
    log(`Exportando ${selected.length} ${currentMode === 'groups' ? 'grupo(s)' : 'etiqueta(s)'}...`)

    const command = currentMode === 'groups' ? 'exportGroups' : 'exportLabels'
    const filename = currentMode === 'groups' ? 'nexor_grupos' : 'nexor_etiquetas'
    const selectedIds = selected.map(s => s.id)
    const selectedNamesMap = Object.fromEntries(selected.map(s => [s.id, s.name]))

    try {
        const result = await sendCommand({ command, selectedIds, selectedNamesMap })
        if (result?.success) {
            log(`${result.rows.length} contactos encontrados`, 'success')
            const ok = await downloadCsv(result.rows, filename)
            if (ok) log('Excel descargado ✓', 'success')
        } else {
            log(result?.error || 'Error desconocido', 'error')
            if (result?.rows?.length > 0) {
                log(`Guardando ${result.rows.length} contactos parciales`)
                await downloadCsv(result.rows, `${filename}_parcial`)
            }
        }
    } catch (err) {
        log(`Error: ${err?.message || err}`, 'error')
    } finally {
        btnExport.disabled = false
    }
})

// ─── Export all chats ──────────────────────────────────────────────────────
btnExportAll.addEventListener('click', async () => {
    btnExportAll.disabled = true
    clearLog()
    log('Exportando todos los chats...')

    try {
        const result = await sendCommand({ command: 'exportAllChats' })
        if (result?.success) {
            log(`${result.rows.length} contactos encontrados`, 'success')
            const ok = await downloadCsv(result.rows, 'nexor_chats')
            if (ok) log('Excel descargado ✓', 'success')
        } else {
            log(result?.error || 'Error desconocido', 'error')
        }
    } catch (err) {
        log(`Error: ${err?.message || err}`, 'error')
    } finally {
        btnExportAll.disabled = false
    }
})

checkWhatsApp()
