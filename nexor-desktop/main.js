// Nexor WhatsApp Extractor — main process
const { app, BrowserWindow, ipcMain, dialog, session } = require('electron')
const path = require('path')
const fs = require('fs')

let mainWindow

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1100,
        minHeight: 700,
        title: 'Nexor WhatsApp Extractor',
        backgroundColor: '#06060A',
        icon: path.join(__dirname, 'icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            webviewTag: true,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
    })

    // Use a persistent session so WhatsApp Web keeps the login
    session.fromPartition('persist:whatsapp')

    mainWindow.loadFile('index.html')
    mainWindow.setMenuBarVisibility(false)

    // Open devtools in development (comment out for production)
    // mainWindow.webContents.openDevTools({ mode: 'detach' })
}

app.whenReady().then(() => {
    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})

// ─── IPC: Save CSV ────────────────────────────────────────────────────────────
ipcMain.handle('save-csv', async (_event, { rows, defaultFilename, mode }) => {
    if (!rows || rows.length === 0) {
        return { success: false, error: 'No hay contactos para guardar' }
    }

    const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Guardar contactos',
        defaultPath: defaultFilename || 'nexor_contactos.csv',
        filters: [
            { name: 'CSV (Excel)', extensions: ['csv'] },
        ],
    })

    if (result.canceled || !result.filePath) return { success: false, canceled: true }

    try {
        const includeName = mode === 'phone_name'
        const headers = includeName ? ['Teléfono', 'Nombre'] : ['Teléfono']
        const lines = [headers.join(',')]
        for (const row of rows) {
            const cells = [`"${(row.phone || '').replace(/"/g, '""')}"`]
            if (includeName) cells.push(`"${(row.name || '').replace(/"/g, '""')}"`)
            lines.push(cells.join(','))
        }
        const bom = '\ufeff' // UTF-8 BOM for Excel
        fs.writeFileSync(result.filePath, bom + lines.join('\n'), 'utf8')
        return { success: true, path: result.filePath, count: rows.length }
    } catch (err) {
        return { success: false, error: err.message }
    }
})

// ─── IPC: Show message ────────────────────────────────────────────────────────
ipcMain.handle('show-message', async (_event, { type, title, message }) => {
    await dialog.showMessageBox(mainWindow, {
        type: type || 'info',
        title: title || 'Nexor',
        message,
    })
})
