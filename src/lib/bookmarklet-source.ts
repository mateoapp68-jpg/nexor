/**
 * Nexor WhatsApp Extractor — Bookmarklet source
 *
 * This code runs directly in web.whatsapp.com page context when user clicks
 * the bookmarklet. It injects a floating UI with extraction buttons.
 *
 * Technique: DOM scraping using stable ARIA roles (same as 58k-user extensions).
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const BOOKMARKLET_CODE = `
(function(){
  if(window.__nexorExtractorLoaded){
    if(window.__nexorExtractorUI) window.__nexorExtractorUI.style.display='block';
    return;
  }
  window.__nexorExtractorLoaded=true;

  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const log=(msg,type)=>{
    const l=document.getElementById('nexor-log');
    if(!l)return;
    const e=document.createElement('div');
    e.style.cssText='margin-bottom:3px;'+(type==='error'?'color:#ef4444':type==='success'?'color:#22c55e':'color:rgba(255,255,255,0.7)');
    e.textContent='> '+msg;
    l.appendChild(e);
    l.scrollTop=l.scrollHeight;
  };
  const clearLog=()=>{const l=document.getElementById('nexor-log');if(l)l.innerHTML='';};

  // ---- UTILITIES ----
  const realClick=el=>{
    if(!el)return false;
    try{
      const r=el.getBoundingClientRect();
      const o={bubbles:true,cancelable:true,view:window,clientX:r.left+r.width/2,clientY:r.top+r.height/2};
      el.dispatchEvent(new MouseEvent('mousedown',o));
      el.dispatchEvent(new MouseEvent('mouseup',o));
      el.dispatchEvent(new MouseEvent('click',o));
      return true;
    }catch(e){return false;}
  };

  const cleanPhone=s=>{
    if(!s)return null;
    const d=String(s).replace(/\\D/g,'');
    if(d.length<8||d.length>15)return null;
    return '+'+d;
  };

  const waitFor=async(fn,timeout=10000)=>{
    const start=Date.now();
    while(Date.now()-start<timeout){
      const r=fn();
      if(r)return r;
      await sleep(200);
    }
    return null;
  };

  const getChatListPane=()=>document.querySelector('#pane-side [role="grid"]')||document.querySelector('[aria-label="Lista de chats"]')||document.querySelector('[aria-label="Chat list"]')||document.querySelector('#pane-side');

  const getChatItems=()=>{
    const p=getChatListPane();
    if(!p)return[];
    return Array.from(p.querySelectorAll('[role="listitem"],[role="row"]')).filter(el=>el.querySelector('span[title]'));
  };

  const getDialog=()=>document.querySelector('[role="dialog"]');

  const closeDialog=async()=>{
    const d=getDialog();
    if(!d)return;
    const btn=d.querySelector('[aria-label="Cerrar"],[aria-label="Close"],button[aria-label*="errar"]');
    if(btn){realClick(btn);await sleep(300);}
    else{document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',keyCode:27,bubbles:true}));await sleep(300);}
  };

  // ---- SCROLL LIST UNTIL COMPLETE ----
  const scrollAll=async(container,maxIter=40)=>{
    if(!container)return;
    let lastH=-1,stable=0;
    for(let i=0;i<maxIter;i++){
      container.scrollTop=container.scrollHeight;
      await sleep(350);
      if(container.scrollHeight===lastH){stable++;if(stable>=3)break;}
      else stable=0;
      lastH=container.scrollHeight;
    }
    container.scrollTop=0;
    await sleep(400);
  };

  // ---- EXTRACT PHONE + NAME FROM A ROW ----
  const extractRow=row=>{
    if(!row)return null;
    let phone=null,name=null;

    // Avatar img trick
    const img=row.querySelector('img');
    if(img&&img.src){
      const m=img.src.match(/[?&]u=(\\d{8,15})/);
      if(m)phone='+'+m[1];
    }

    // Title span with phone format
    if(!phone){
      const spans=row.querySelectorAll('span[title]');
      for(const s of spans){
        const t=s.getAttribute('title')||'';
        if(/^\\s*\\+?\\d[\\d\\s\\-\\(\\)]{7,20}\\d\\s*$/.test(t)){
          phone=cleanPhone(t);
          if(phone)break;
        }
      }
    }

    // innerText fallback
    if(!phone){
      const txt=row.innerText||'';
      const m=txt.match(/\\+\\d[\\d\\s\\-\\(\\)]{7,20}\\d/);
      if(m)phone=cleanPhone(m[0]);
    }

    // Name: any title that is NOT a phone
    const spans=row.querySelectorAll('span[title]');
    for(const s of spans){
      const t=(s.getAttribute('title')||'').trim();
      if(!t)continue;
      if(/^\\+?\\d[\\d\\s\\-\\(\\)]+$/.test(t))continue;
      if(/^(you|tú|tu)$/i.test(t))continue;
      name=t;
      break;
    }

    return phone?{phone,name:name||''}:null;
  };

  // ---- DOWNLOAD CSV ----
  const downloadCsv=(rows,filename,mode)=>{
    if(!rows||rows.length===0){log('Sin contactos','error');return;}
    const includeName=mode==='phone_name';
    const headers=includeName?['Teléfono','Nombre']:['Teléfono'];
    const lines=[headers.join(',')];
    for(const r of rows){
      const c=['"'+(r.phone||'').replace(/"/g,'""')+'"'];
      if(includeName)c.push('"'+(r.name||'').replace(/"/g,'""')+'"');
      lines.push(c.join(','));
    }
    const blob=new Blob(['\\ufeff'+lines.join('\\n')],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=filename+'_'+Date.now()+'.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    log('✓ Descarga iniciada',' success');
  };

  // ---- EXTRACT GROUP MEMBERS ----
  const extractGroup=async(item,groupName)=>{
    const contacts=[];
    const seen=new Set();
    try{
      realClick(item);
      await sleep(800);
      const header=document.querySelector('#main header');
      if(!header)throw new Error('header no encontrado');
      const hc=header.querySelector('[role="button"]')||header.firstElementChild;
      if(!hc)throw new Error('header clickable no encontrado');
      realClick(hc);
      await sleep(1500);

      const dialog=await waitFor(getDialog,5000);
      if(!dialog)throw new Error('panel del grupo no se abrió');

      // Find scrollable container inside dialog
      let scrollable=null;
      const all=dialog.querySelectorAll('div');
      for(const el of all){
        const st=getComputedStyle(el);
        if((st.overflowY==='auto'||st.overflowY==='scroll')&&el.scrollHeight>el.clientHeight){
          scrollable=el;break;
        }
      }

      // Click "view all members" if exists
      const viewAll=Array.from(dialog.querySelectorAll('[role="button"]')).find(b=>{
        const t=(b.textContent||'').toLowerCase();
        return /ver\\s+todos|view\\s+all/.test(t);
      });
      if(viewAll){realClick(viewAll);await sleep(800);}

      // Scroll + extract loop
      let noNew=0,scrollTop=0;
      for(let it=0;it<150;it++){
        const rows=Array.from(dialog.querySelectorAll('[role="listitem"]'));
        let added=0;
        for(const row of rows){
          const c=extractRow(row);
          if(!c)continue;
          if(seen.has(c.phone))continue;
          seen.add(c.phone);
          contacts.push({phone:c.phone,name:c.name,source:'Grupo: '+groupName});
          added++;
        }
        if(added===0){noNew++;if(noNew>=4)break;}
        else noNew=0;

        if(scrollable){
          scrollTop+=500;
          scrollable.scrollTop=scrollTop;
        }
        await sleep(350);
      }
    }catch(e){log('Error grupo '+groupName+': '+e.message,'error');}
    await closeDialog();
    return contacts;
  };

  // ---- MAIN EXTRACTION FUNCTIONS ----
  const listGroups=async()=>{
    const pane=getChatListPane();
    if(!pane){log('Abrí WhatsApp Web','error');return[];}
    log('Cargando lista de chats...');
    await scrollAll(pane);
    const items=getChatItems();
    const groups=[];
    for(let i=0;i<items.length;i++){
      const item=items[i];
      const isGroup=!!item.querySelector('[data-icon*="default-group"]');
      if(!isGroup)continue;
      const n=item.querySelector('span[title]');
      const name=n?.getAttribute('title')||'Sin nombre';
      groups.push({index:i,name,item});
    }
    log('Encontrados '+groups.length+' grupos','success');
    return groups;
  };

  const extractAllGroups=async(mode)=>{
    clearLog();
    const groups=await listGroups();
    if(groups.length===0){log('No hay grupos','error');return;}

    const allContacts=[];
    const seen=new Set();
    for(let i=0;i<groups.length;i++){
      log('Grupo '+(i+1)+'/'+groups.length+': '+groups[i].name);
      const items=getChatItems();
      const freshItem=items[groups[i].index];
      if(!freshItem){log('  saltado','error');continue;}
      const contacts=await extractGroup(freshItem,groups[i].name);
      log('  '+contacts.length+' contactos','success');
      for(const c of contacts){
        if(seen.has(c.phone))continue;
        seen.add(c.phone);
        allContacts.push(c);
      }
    }
    log('Total único: '+allContacts.length+' contactos','success');
    downloadCsv(allContacts,'nexor_grupos',mode);
  };

  const extractLabels=async(mode)=>{
    clearLog();
    const systemTabs=['todos','all','no leídos','unread','no leidos','favoritos','favorites','grupos','groups','comunidades','communities'];
    const tabs=Array.from(document.querySelectorAll('[role="tab"],[aria-selected]'));
    const labels=[];
    const seenName=new Set();
    for(const t of tabs){
      const n=(t.textContent||'').trim();
      if(!n||n.length>50)continue;
      if(systemTabs.includes(n.toLowerCase()))continue;
      if(/^\\d+$/.test(n))continue;
      if(seenName.has(n))continue;
      seenName.add(n);
      labels.push({name:n,tab:t});
    }
    if(labels.length===0){log('Sin etiquetas (requiere WhatsApp Business)','error');return;}
    log('Encontradas '+labels.length+' etiquetas','success');

    const allContacts=[];
    const seen=new Set();
    for(const label of labels){
      log('Etiqueta: '+label.name);
      realClick(label.tab);
      await sleep(900);
      const pane=getChatListPane();
      if(!pane)continue;
      await scrollAll(pane,20);
      const items=getChatItems();
      for(let i=0;i<items.length;i++){
        const fresh=getChatItems();
        const it=fresh[i];
        if(!it)continue;
        const n=it.querySelector('span[title]');
        const name=n?.getAttribute('title')||'';
        realClick(it);
        await sleep(500);
        const header=document.querySelector('#main header');
        if(!header)continue;
        const hc=header.querySelector('[role="button"]')||header.firstElementChild;
        if(!hc)continue;
        realClick(hc);
        await sleep(700);
        const dialog=getDialog();
        if(dialog){
          const txt=dialog.innerText||'';
          const m=txt.match(/\\+\\d[\\d\\s\\-\\(\\)]{7,20}\\d/);
          if(m){
            const phone=cleanPhone(m[0]);
            if(phone&&!seen.has(phone)){
              seen.add(phone);
              allContacts.push({phone,name,source:'Etiqueta: '+label.name});
            }
          }
          await closeDialog();
        }
      }
    }
    log('Total: '+allContacts.length,'success');
    downloadCsv(allContacts,'nexor_etiquetas',mode);
  };

  const extractAllChats=async(mode)=>{
    clearLog();
    const pane=getChatListPane();
    if(!pane){log('Abrí WhatsApp Web','error');return;}
    log('Cargando chats...');
    await scrollAll(pane);
    const items=getChatItems();
    const nonGroups=[];
    for(let i=0;i<items.length;i++){
      if(items[i].querySelector('[data-icon*="default-group"]'))continue;
      const n=items[i].querySelector('span[title]');
      nonGroups.push({index:i,name:n?.getAttribute('title')||''});
    }
    log('Procesando '+nonGroups.length+' chats...');
    const contacts=[];
    const seen=new Set();
    for(let i=0;i<nonGroups.length;i++){
      const fresh=getChatItems();
      const it=fresh[nonGroups[i].index];
      if(!it)continue;
      realClick(it);
      await sleep(450);
      const header=document.querySelector('#main header');
      if(!header)continue;
      const hc=header.querySelector('[role="button"]')||header.firstElementChild;
      if(!hc)continue;
      realClick(hc);
      await sleep(650);
      const dialog=getDialog();
      if(dialog){
        const txt=dialog.innerText||'';
        const m=txt.match(/\\+\\d[\\d\\s\\-\\(\\)]{7,20}\\d/);
        if(m){
          const phone=cleanPhone(m[0]);
          if(phone&&!seen.has(phone)){
            seen.add(phone);
            contacts.push({phone,name:nonGroups[i].name,source:'Chat'});
          }
        }
        await closeDialog();
      }
      if(i%10===0)log('  procesados '+i+'/'+nonGroups.length);
    }
    log('Total: '+contacts.length,'success');
    downloadCsv(contacts,'nexor_chats',mode);
  };

  // ---- FLOATING UI ----
  const ui=document.createElement('div');
  ui.id='nexor-extractor-ui';
  window.__nexorExtractorUI=ui;
  ui.innerHTML='<div id="nx-header" style="padding:14px 16px;background:linear-gradient(135deg,#B45309,#D97706,#FFD700);color:#000;font-weight:900;font-size:13px;display:flex;align-items:center;justify-content:space-between;cursor:move;border-radius:12px 12px 0 0"><span>🔥 NEXOR EXTRACTOR</span><span id="nx-close" style="cursor:pointer;font-size:18px;padding:0 6px">✕</span></div><div style="padding:14px"><div style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;margin-bottom:8px">Modo</div><div style="display:flex;gap:6px;margin-bottom:14px"><button id="nx-mode-phone" class="nx-mode active" style="flex:1;padding:8px;background:rgba(217,119,6,0.15);border:1px solid rgba(217,119,6,0.5);border-radius:8px;color:#FFD700;font-size:10px;font-weight:700;cursor:pointer">Solo teléfono</button><button id="nx-mode-name" class="nx-mode" style="flex:1;padding:8px;background:transparent;border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:rgba(255,255,255,0.5);font-size:10px;font-weight:700;cursor:pointer">Teléfono + Nombre</button></div><div style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;margin-bottom:8px">Extraer</div><button id="nx-btn-groups" style="width:100%;padding:12px;margin-bottom:6px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:#fff;font-size:12px;font-weight:700;cursor:pointer;text-align:left">👥 Todos los grupos</button><button id="nx-btn-labels" style="width:100%;padding:12px;margin-bottom:6px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:#fff;font-size:12px;font-weight:700;cursor:pointer;text-align:left">🏷️ Todas las etiquetas</button><button id="nx-btn-all" style="width:100%;padding:12px;margin-bottom:12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:#fff;font-size:12px;font-weight:700;cursor:pointer;text-align:left">💬 Todos los chats</button><div id="nexor-log" style="max-height:180px;overflow-y:auto;padding:10px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.05);border-radius:8px;font-family:monospace;font-size:10px;line-height:1.5;color:rgba(255,255,255,0.7)"></div></div>';
  ui.style.cssText='position:fixed;top:20px;right:20px;width:300px;background:#06060A;border:1px solid rgba(255,255,255,0.1);border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,0.5);z-index:999999;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#fff';
  document.body.appendChild(ui);

  let currentMode='phone';
  document.getElementById('nx-mode-phone').onclick=()=>{
    currentMode='phone';
    document.getElementById('nx-mode-phone').style.cssText='flex:1;padding:8px;background:rgba(217,119,6,0.15);border:1px solid rgba(217,119,6,0.5);border-radius:8px;color:#FFD700;font-size:10px;font-weight:700;cursor:pointer';
    document.getElementById('nx-mode-name').style.cssText='flex:1;padding:8px;background:transparent;border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:rgba(255,255,255,0.5);font-size:10px;font-weight:700;cursor:pointer';
  };
  document.getElementById('nx-mode-name').onclick=()=>{
    currentMode='phone_name';
    document.getElementById('nx-mode-name').style.cssText='flex:1;padding:8px;background:rgba(217,119,6,0.15);border:1px solid rgba(217,119,6,0.5);border-radius:8px;color:#FFD700;font-size:10px;font-weight:700;cursor:pointer';
    document.getElementById('nx-mode-phone').style.cssText='flex:1;padding:8px;background:transparent;border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:rgba(255,255,255,0.5);font-size:10px;font-weight:700;cursor:pointer';
  };

  document.getElementById('nx-btn-groups').onclick=()=>extractAllGroups(currentMode);
  document.getElementById('nx-btn-labels').onclick=()=>extractLabels(currentMode);
  document.getElementById('nx-btn-all').onclick=()=>extractAllChats(currentMode);
  document.getElementById('nx-close').onclick=()=>ui.remove();

  // Draggable header
  let drag=false,offX=0,offY=0;
  const h=document.getElementById('nx-header');
  h.onmousedown=e=>{drag=true;offX=e.clientX-ui.offsetLeft;offY=e.clientY-ui.offsetTop;};
  document.onmousemove=e=>{if(drag){ui.style.left=(e.clientX-offX)+'px';ui.style.right='auto';ui.style.top=(e.clientY-offY)+'px';}};
  document.onmouseup=()=>{drag=false;};

  log('Nexor Extractor listo','success');
})();
`.trim()
