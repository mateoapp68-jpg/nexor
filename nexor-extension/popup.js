// Nexor WhatsApp Exporter — popup script

const statusEl = document.getElementById('status')
const statusText = document.getElementById('statusText')
const logEl = document.getElementById('log')
const btnGroups = document.getElementById('btnGroups')
const btnLabels = document.getElementById('btnLabels')
const btnAll = document.getElementById('btnAll')

function log(msg, type = '') {
    logEl.classList.add('show')
    const entry = document.createElement('div')
    entry.className = `log-entry ${type}`
    entry.textContent = `> ${msg}`
    logEl.appendChild(entry)
    logEl.scrollTop = logEl.scrollHeight
}

async function checkWhatsApp() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.url?.includes('web.whatsapp.com')) {
        statusText.textContent = 'Abrí web.whatsapp.com primero'
        return false
    }
    statusEl.classList.remove('err')
    statusEl.classList.add('ok')
    statusText.textContent = 'Conectado a WhatsApp Web'
    btnGroups.disabled = false
    btnLabels.disabled = false
    btnAll.disabled = false
    return true
}

async function sendCommand(command) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) return
    try {
        const response = await chrome.tabs.sendMessage(tab.id, { command })
        return response
    } catch (err) {
        log(`Error: ${err.message}`, 'error')
        log('Recargá web.whatsapp.com y abrí de nuevo el popup', 'error')
        return null
    }
}

async function downloadExcel(rows, filename) {
    // Generate CSV (easier than XLSX without libs)
    const headers = ['Teléfono', 'Nombre', 'Grupo/Etiqueta']
    const csv = [headers.join(',')]
    for (const row of rows) {
        const line = [
            `"${row.phone || ''}"`,
            `"${(row.name || '').replace(/"/g, '""')}"`,
            `"${(row.source || '').replace(/"/g, '""')}"`,
        ].join(',')
        csv.push(line)
    }
    const bom = '\ufeff' // UTF-8 BOM for Excel
    const blob = new Blob([bom + csv.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    await chrome.downloads.download({
        url,
        filename: `${filename}_${Date.now()}.csv`,
        saveAs: true,
    })
    setTimeout(() => URL.revokeObjectURL(url), 1000)
}

btnGroups.addEventListener('click', async () => {
    btnGroups.disabled = true
    log('Iniciando exportación de grupos...')
    const result = await sendCommand('exportGroups')
    if (result?.success) {
        log(`${result.rows.length} contactos encontrados`, 'success')
        await downloadExcel(result.rows, 'nexor_grupos')
        log('Excel descargado ✓', 'success')
    } else {
        log(result?.error || 'Error desconocido', 'error')
    }
    btnGroups.disabled = false
})

btnLabels.addEventListener('click', async () => {
    btnLabels.disabled = true
    log('Iniciando exportación de etiquetas...')
    const result = await sendCommand('exportLabels')
    if (result?.success) {
        log(`${result.rows.length} contactos encontrados`, 'success')
        await downloadExcel(result.rows, 'nexor_etiquetas')
        log('Excel descargado ✓', 'success')
    } else {
        log(result?.error || 'Error desconocido', 'error')
    }
    btnLabels.disabled = false
})

btnAll.addEventListener('click', async () => {
    btnAll.disabled = true
    log('Iniciando exportación de chats...')
    const result = await sendCommand('exportAllChats')
    if (result?.success) {
        log(`${result.rows.length} contactos encontrados`, 'success')
        await downloadExcel(result.rows, 'nexor_chats')
        log('Excel descargado ✓', 'success')
    } else {
        log(result?.error || 'Error desconocido', 'error')
    }
    btnAll.disabled = false
})

checkWhatsApp()
