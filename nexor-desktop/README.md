# Nexor WhatsApp Extractor

App de escritorio (Electron) para extraer contactos de grupos y etiquetas de WhatsApp Web al CRM de Nexor.

## Features

- Grupos: lista todos los grupos y exportá sus miembros con números reales
- Etiquetas: contactos agrupados por etiqueta (WhatsApp Business)
- Todos los chats: lista completa de contactos
- Selección por checkbox con buscador
- Modo de exportación: solo teléfono o teléfono + nombre
- Exporta a CSV compatible con Excel
- Sesión de WhatsApp persistente (no escaneás el QR cada vez)

## Desarrollo

```bash
cd nexor-desktop
npm install
npm start
```

Se abre la ventana con WhatsApp Web embebido. Al primer uso escaneás el QR.

## Build para distribución

```bash
# Windows (.exe)
npm run build:win

# Mac (.dmg)
npm run build:mac

# Linux (.AppImage)
npm run build:linux
```

Los builds quedan en `dist/`.

## Arquitectura

```
nexor-desktop/
├── main.js         — Electron main process (ventana, IPC, save dialog)
├── preload.js      — Bridge seguro entre renderer y main
├── index.html      — UI de la app (sidebar + webview)
├── style.css       — Estilos
├── app.js          — Lógica del renderer
└── extractor.js    — Se inyecta en WhatsApp Web, accede al Store interno
```

El `extractor.js` se inyecta en el `<webview>` vía `executeJavaScript`.
Hunt webpack modules para encontrar `Store.Chat`, `Store.Label`, `Store.Contact`.
Los datos vienen directos del modelo interno, sin parsear DOM.

## Cómo integra con Nexor

El usuario exporta CSV con esta app, después en Nexor va a:
**CRM → Nueva campaña → Excel** y sube el archivo.

## Privacidad

- Los datos nunca salen de la computadora del usuario
- La sesión de WhatsApp se guarda en el perfil de Electron (no se envía a ningún server)
- El CSV se guarda donde el usuario elija
