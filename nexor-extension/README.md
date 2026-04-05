# Nexor Contacts Extractor v2.0.0

Extensión de Chrome para extraer contactos de WhatsApp Web con números reales y exportarlos al CRM de Nexor.

## Cómo se instala

1. Descomprimí el ZIP
2. Abrí Chrome y andá a `chrome://extensions/`
3. Activá el **Modo de desarrollador** (arriba a la derecha)
4. Click en **"Cargar extensión sin empaquetar"**
5. Seleccioná la carpeta descomprimida
6. Aparece el ícono de Nexor en la barra de extensiones

## Cómo se usa

1. Abrí `web.whatsapp.com` y escaneá el QR con tu celular
2. Esperá a que carguen todos los chats
3. Click en el ícono de Nexor en la barra de Chrome
4. Elegí qué exportar:
   - **Grupos** — miembros de grupos con teléfonos reales
   - **Etiquetas** — contactos por etiqueta (solo WhatsApp Business)
   - **Todos los chats** — lista completa de conversaciones
5. Seleccioná lo que querés y elegí el modo (solo teléfono o teléfono + nombre)
6. Click en **Exportar** → descarga un CSV
7. Volvé a Nexor → CRM → Nueva campaña → Subí el CSV

## Cómo funciona técnicamente

La extensión inyecta un script en WhatsApp Web que accede al Store interno de la aplicación. Usa la técnica de **webpack module hooking** (la misma que usa wa-js y WPPConnect):

1. Al cargar WhatsApp Web, la extensión hook `webpackChunkwhatsapp_web_client`
2. Captura el `__webpack_require__` de WhatsApp
3. Itera `require.c` (módulos cargados) buscando `Store.Chat`, `Store.Label`, `Store.Contact`
4. Con el Store, accede directamente a los modelos de chats, grupos, etiquetas
5. Los números vienen de `chat.id.user` — 100% reales, sin LIDs

## Privacidad

- **Todos los datos quedan en tu navegador**, no se envían a ningún servidor
- El CSV se guarda donde vos elijas
- La extensión solo funciona en `web.whatsapp.com`
- No envía mensajes, solo lee datos

## Limitaciones

- WhatsApp Web debe estar cargado con tus chats visibles
- Las etiquetas solo funcionan con cuentas de **WhatsApp Business**
- Miembros de grupos aparecen con su teléfono real solo si WhatsApp lo expone (depende de si sos admin del grupo o si los tenés en tu agenda)

---

Nexor CRM · v2.0.0 · Solo números reales
