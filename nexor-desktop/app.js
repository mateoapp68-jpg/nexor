// Nexor Desktop — renderer logic

const $ = (id) => document.getElementById(id)

const statusBadge = $('statusBadge')
const statusLabel = $('statusLabel')
const statusText = $('statusText')
const logEl = $('log')

const viewMain = $('viewMain')
const viewSelect = $('viewSelect')
const viewAll = $('viewAll')

const btnGroups = $('btnGroups')
const btnLabels = $('btnLabels')
const btnAllChats = $('btnAllChats')
const btnExport = $('btnExport')
const btnExportAll = $('btnExportAll')
const backBtn = $('backBtn')
const backBtnAll = $('backBtnAll')
const selectAllBtn = $('selectAllBtn')
const searchInput = $('searchInput')
const itemsList = $('itemsList')
const loadingList = $('loadingList')
const listContent = $('listContent')
const selectTitle = $('selectTitle')

const webview = $('wa')

// State
let currentMode = null // 'groups' | 'labels'
let items = []
let filtered = []
let exportMode = 'phone' // 'phone' | 'phone_name'

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

// ─── Views ─────────────────────────────────────────────────────────────────
function showView(view) {
    viewMain.classList.remove('active')
    viewSelect.classList.remove('active')
    viewAll.classList.remove('active')
    view.classList.add('active')
}

// ─── Status ────────────────────────────────────────────────────────────────
function setStatus(state, label) {
    statusBadge.className = `status status-${state}`
    statusLabel.textContent = label
    if (state === 'ok') {
        statusText.textContent = 'Listo para extraer'
        btnGroups.disabled = false
        btnLabels.disabled = false
        btnAllChats.disabled = false
    } else if (state === 'loading') {
        statusText.textContent = 'Cargando WhatsApp Web...'
        btnGroups.disabled = true
        btnLabels.disabled = true
        btnAllChats.disabled = true
    } else {
        statusText.textContent = 'Error'
    }
}

// ─── Webview integration ───────────────────────────────────────────────────
async function injectExtractor() {
    const code = window.nexor.getExtractorSource()
    if (!code) throw new Error('No se pudo leer extractor.js')
    await webview.executeJavaScript(code)
}

async function callExtractor(expr) {
    try {
        return await webview.executeJavaScript(expr)
    } catch (err) {
        return { success: false, error: err?.message || String(err) }
    }
}

webview.addEventListener('dom-ready', async () => {
    log('WhatsApp Web cargado')
    setStatus('loading', 'Inyectando extractor...')

    try {
        await injectExtractor()
        log('Extractor inyectado ✓', 'success')

        // Poll ping until ready
        const startTime = Date.now()
        const pollPing = async () => {
            const result = await callExtractor('window.NexorAPI?.ping ? window.NexorAPI.ping() : { ready: false }')
            if (result?.ready) {
                setStatus('ok', result.hasLabels ? 'WhatsApp Business detectado ✓' : 'Conectado ✓')
                log('Store de WhatsApp listo ✓', 'success')
                return
            }
            if (Date.now() - startTime > 120000) {
                setStatus('err', 'Timeout esperando WhatsApp')
                log('Timeout: WhatsApp no cargó en 2 minutos', 'error')
                return
            }
            setTimeout(pollPing, 2000)
        }
        pollPing()
    } catch (err) {
        log(`Error: ${err?.message || err}`, 'error')
        setStatus('err', 'Error al cargar')
    }
})

webview.addEventListener('did-fail-load', (e) => {
    if (e.isMainFrame) {
        log(`Error de carga: ${e.errorDescription}`, 'error')
        setStatus('err', 'Error al cargar WhatsApp Web')
    }
})

// ─── Load list (groups or labels) ──────────────────────────────────────────
async function loadList(mode) {
    currentMode = mode
    items = []
    filtered = []
    clearLog()
    searchInput.value = ''

    selectTitle.textContent = mode === 'groups' ? 'Seleccioná los grupos' : 'Seleccioná las etiquetas'

    showView(viewSelect)
    loadingList.style.display = 'flex'
    listContent.style.display = 'none'
    btnExport.disabled = true

    const action = mode === 'groups' ? 'listGroups' : 'listLabels'
    const result = await callExtractor(`window.NexorAPI.${action}()`)

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
        meta: mode === 'groups' ? `${x.participantCount || 0} miembros` : '',
        selected: false,
    }))
    filtered = [...items]
    renderItems()
    listContent.style.display = 'block'
}

// ─── Render list ───────────────────────────────────────────────────────────
function renderItems() {
    if (filtered.length === 0) {
        const msg = items.length === 0
            ? (currentMode === 'groups' ? 'No se encontraron grupos' : 'No se encontraron etiquetas')
            : 'Sin resultados para esa búsqueda'
        itemsList.innerHTML = `<div class="empty">${msg}</div>`
        btnExport.disabled = true
        return
    }

    itemsList.innerHTML = ''
    filtered.forEach((item) => {
        const div = document.createElement('div')
        div.className = `item ${item.selected ? 'selected' : ''}`
        div.innerHTML = `
      <div class="checkbox">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <div class="item-body">
        <div class="item-name"></div>
        ${item.meta ? '<div class="item-meta"></div>' : ''}
      </div>
    `
        div.querySelector('.item-name').textContent = item.name
        const metaEl = div.querySelector('.item-meta')
        if (metaEl) metaEl.textContent = item.meta
        div.addEventListener('click', () => {
            item.selected = !item.selected
            renderItems()
        })
        itemsList.appendChild(div)
    })

    const anySelected = items.some(i => i.selected)
    btnExport.disabled = !anySelected
    const allSelected = items.every(i => i.selected)
    selectAllBtn.textContent = allSelected ? 'Quitar todos' : 'Seleccionar todos'
}

// ─── Search filter ─────────────────────────────────────────────────────────
searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase().trim()
    filtered = q ? items.filter(i => i.name.toLowerCase().includes(q)) : [...items]
    renderItems()
})

// ─── Select all ────────────────────────────────────────────────────────────
selectAllBtn.addEventListener('click', () => {
    const allSelected = items.every(i => i.selected)
    items.forEach(i => { i.selected = !allSelected })
    renderItems()
})

// ─── Back buttons ──────────────────────────────────────────────────────────
backBtn.addEventListener('click', () => {
    showView(viewMain)
    currentMode = null
    items = []
    filtered = []
})

backBtnAll.addEventListener('click', () => {
    showView(viewMain)
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
btnAllChats.addEventListener('click', () => {
    clearLog()
    showView(viewAll)
})

// ─── Export selected ───────────────────────────────────────────────────────
btnExport.addEventListener('click', async () => {
    const selected = items.filter(i => i.selected)
    if (selected.length === 0) return

    btnExport.disabled = true
    clearLog()
    log(`Extrayendo ${selected.length} ${currentMode === 'groups' ? 'grupo(s)' : 'etiqueta(s)'}...`)

    const action = currentMode === 'groups' ? 'getGroupContacts' : 'getLabelContacts'
    const allRows = []
    const seen = new Set()

    for (const item of selected) {
        const result = await callExtractor(`window.NexorAPI.${action}(${JSON.stringify(item.id)})`)
        if (result?.success && result.contacts) {
            for (const c of result.contacts) {
                const key = `${item.id}:${c.phone}`
                if (seen.has(key)) continue
                seen.add(key)
                allRows.push({ phone: c.phone, name: c.name || '' })
            }
            log(`  ${item.name}: ${result.contacts.length} contactos`, 'success')
        } else {
            log(`  ${item.name}: ${result?.error || 'error'}`, 'error')
        }
    }

    log(`Total único: ${allRows.length} contactos`, 'success')

    if (allRows.length === 0) {
        await window.nexor.showMessage({ type: 'warning', title: 'Sin contactos', message: 'No se encontraron contactos en la selección.' })
        btnExport.disabled = false
        return
    }

    const filename = currentMode === 'groups' ? 'nexor_grupos.csv' : 'nexor_etiquetas.csv'
    const saveResult = await window.nexor.saveCsv({
        rows: allRows,
        defaultFilename: filename,
        mode: exportMode,
    })

    if (saveResult.success) {
        log(`Guardado: ${saveResult.path}`, 'success')
        log(`${saveResult.count} contactos exportados ✓`, 'success')
    } else if (saveResult.canceled) {
        log('Exportación cancelada')
    } else {
        log(`Error: ${saveResult.error}`, 'error')
    }

    btnExport.disabled = false
})

// ─── Export all chats ──────────────────────────────────────────────────────
btnExportAll.addEventListener('click', async () => {
    btnExportAll.disabled = true
    clearLog()
    log('Extrayendo todos los chats...')

    const result = await callExtractor('window.NexorAPI.listAllChats()')

    if (!result?.success) {
        log(result?.error || 'Error desconocido', 'error')
        btnExportAll.disabled = false
        return
    }

    log(`${result.contacts.length} contactos encontrados`, 'success')

    if (result.contacts.length === 0) {
        await window.nexor.showMessage({ type: 'info', title: 'Sin contactos', message: 'No se encontraron chats individuales.' })
        btnExportAll.disabled = false
        return
    }

    const saveResult = await window.nexor.saveCsv({
        rows: result.contacts,
        defaultFilename: 'nexor_chats.csv',
        mode: exportMode,
    })

    if (saveResult.success) {
        log(`Guardado: ${saveResult.path}`, 'success')
        log(`${saveResult.count} contactos exportados ✓`, 'success')
    } else if (saveResult.canceled) {
        log('Exportación cancelada')
    } else {
        log(`Error: ${saveResult.error}`, 'error')
    }

    btnExportAll.disabled = false
})

// Init
setStatus('loading', 'Esperando WhatsApp Web')
