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

function setAllDisabled(disabled) {
    btnGroups.disabled = disabled
    btnLabels.disabled = disabled
    btnAll.disabled = disabled
}

async function checkWhatsApp() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        if (!tab?.url?.includes('web.whatsapp.com')) {
            statusText.textContent = 'Abrí web.whatsapp.com primero'
            return false
        }
        statusEl.classList.remove('err')
        statusEl.classList.add('ok')
        statusText.textContent = 'Conectado a WhatsApp Web'
        setAllDisabled(false)
        return true
    } catch {
        statusText.textContent = 'Error al verificar pestaña'
        return false
    }
}

// Send command with timeout
async function sendCommand(command, timeoutMs = 10 * 60 * 1000) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) {
        return { success: false, error: 'No se encontró la pestaña activa' }
    }

    const responsePromise = chrome.tabs.sendMessage(tab.id, { command }).catch(err => {
        return { success: false, error: err?.message || 'Error de comunicación con WhatsApp Web' }
    })

    const timeoutPromise = new Promise(resolve => {
        setTimeout(() => resolve({ success: false, error: `Timeout tras ${Math.round(timeoutMs / 1000)}s — recargá WhatsApp Web` }), timeoutMs)
    })

    return Promise.race([responsePromise, timeoutPromise])
}

async function downloadExcel(rows, filename) {
    if (!rows || rows.length === 0) {
        log('No hay contactos para descargar', 'error')
        return false
    }
    try {
        const headers = ['Teléfono', 'Nombre', 'Grupo/Etiqueta']
        const csv = [headers.join(',')]
        for (const row of rows) {
            const line = [
                `"${(row.phone || '').replace(/"/g, '""')}"`,
                `"${(row.name || '').replace(/"/g, '""')}"`,
                `"${(row.source || '').replace(/"/g, '""')}"`,
            ].join(',')
            csv.push(line)
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

async function runExport(command, filename, label) {
    setAllDisabled(true)
    log(`Iniciando ${label}...`)
    log('⚠️ Puede tardar varios minutos — no cierres esta ventana')
    try {
        const result = await sendCommand(command)
        if (result?.success) {
            log(`${result.rows.length} contactos encontrados`, 'success')
            const ok = await downloadExcel(result.rows, filename)
            if (ok) log('Excel descargado ✓', 'success')
        } else {
            log(result?.error || 'Error desconocido', 'error')
            if (result?.rows?.length > 0) {
                log(`Se exportarán los ${result.rows.length} contactos encontrados antes del error`)
                await downloadExcel(result.rows, `${filename}_parcial`)
            }
        }
    } catch (err) {
        log(`Error inesperado: ${err?.message || err}`, 'error')
    } finally {
        setAllDisabled(false)
    }
}

btnGroups.addEventListener('click', () => runExport('exportGroups', 'nexor_grupos', 'exportación de grupos'))
btnLabels.addEventListener('click', () => runExport('exportLabels', 'nexor_etiquetas', 'exportación de etiquetas'))
btnAll.addEventListener('click', () => runExport('exportAllChats', 'nexor_chats', 'exportación de chats'))

checkWhatsApp()
