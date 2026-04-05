# Nexor WhatsApp Exporter

Extensión de Chrome para exportar contactos de grupos y etiquetas de WhatsApp Business Web al CRM de Nexor.

## Instalación

1. Descomprimí el archivo `.zip` en una carpeta
2. Abrí Chrome y navegá a `chrome://extensions/`
3. Activá el **Modo de desarrollador** (arriba a la derecha)
4. Click en **Cargar extensión sin empaquetar**
5. Seleccioná la carpeta descomprimida
6. Listo — verás el icono de Nexor en la barra de extensiones

## Uso

1. Abrí https://web.whatsapp.com y escaneá el QR
2. Esperá que carguen los chats
3. Click en el icono de la extensión Nexor
4. Elegí qué exportar:
   - **Exportar grupos** — Todos los grupos y sus miembros
   - **Exportar etiquetas** — Contactos agrupados por etiqueta (solo WhatsApp Business)
   - **Exportar todos los chats** — Lista completa de contactos
5. Se descarga un `.csv` compatible con Excel

## Importar en Nexor

1. Abrí Nexor → CRM → Nueva campaña
2. En "Contactos", elegí la pestaña **"Excel"**
3. Subí el archivo `.csv` descargado
4. Listo, todos los contactos aparecen listos para enviar

## Notas importantes

- Solo funciona con **WhatsApp Web abierto** en el navegador
- Para etiquetas necesitas una cuenta de **WhatsApp Business**
- El proceso puede tardar varios minutos en cuentas con muchos chats
- No cierres la pestaña de WhatsApp Web mientras se ejecuta
- Esta extensión **solo lee datos**, no envía mensajes
- ⚠️ **Efecto secundario**: Como la extensión abre cada chat para leer el número,
  los chats quedan marcados como leídos. Si esto es un problema, exportá solo
  grupos (no requiere abrir chats individuales).

## Problemas comunes

**"No se encontró la lista de chats"**
Recargá web.whatsapp.com y abrí el popup de nuevo.

**"No se encontraron etiquetas"**
Solo funciona con cuentas de WhatsApp Business. Si usás WhatsApp personal, no vas a tener etiquetas.

**La extensión se quedó colgada**
Refrescá la página de WhatsApp Web (F5) y volvé a intentar.

---

Nexor CRM · v1.0.0
