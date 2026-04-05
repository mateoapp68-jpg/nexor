// Preload script — exposes a safe API to the renderer
const { contextBridge, ipcRenderer } = require('electron')
const fs = require('fs')
const path = require('path')

// Read the extractor source once at startup
let extractorSource = ''
try {
    extractorSource = fs.readFileSync(path.join(__dirname, 'extractor.js'), 'utf8')
} catch (err) {
    console.error('Failed to read extractor.js:', err)
}

contextBridge.exposeInMainWorld('nexor', {
    saveCsv: (data) => ipcRenderer.invoke('save-csv', data),
    showMessage: (data) => ipcRenderer.invoke('show-message', data),
    getExtractorSource: () => extractorSource,
})
