window.UI=(()=>{
 const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const paths={home:'m3 10 9-7 9 7v10H3Z M9 20v-7h6v7',grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',device:'M6 3h12v18H6z M9 7h6 M9 11h6 M10 17h4',chart:'M3 3v18h18 M6 15l4-5 4 3 6-8',folder:'M3 6h7l2 3h9v11H3z',gear:'m9 3-.7 3-2 .9-2.7-.9-1.5 2.6 2 2.1v2.5l-2 2.1 1.5 2.6 2.7-.9 2 .9.7 3h3l.7-3 2-.9 2.7.9 1.5-2.6-2-2.1v-2.5l2-2.1-1.5-2.6-2.7.9-2-.9-.7-3z M14.5 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',left:'m14 6-6 6 6 6',right:'m10 6 6 6-6 6',down:'m6 9 6 6 6-6',plus:'M12 5v14 M5 12h14',close:'m6 6 12 12 M18 6 6 18',play:'m8 4 12 8-12 8z',pause:'M8 5v14 M16 5v14',stop:'M5 5h14v14H5z',check:'m5 12 4 4L19 6',alert:'m12 3 10 18H2z M12 9v4 M12 17h.01',clock:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 7v5l3 2',search:'M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0 m-2 5 6 6',more:'M5 12h.01 M12 12h.01 M19 12h.01',download:'M12 3v12 m-5-5 5 5 5-5 M4 16v5h16v-5',trash:'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',copy:'M8 8h13v13H8z M16 8V3H3v13h5',save:'M3 3h15l3 3v15H3z M7 3v6h10V3 M7 21v-8h10v8',undo:'M8 4 3 9l5 5 M3 9h11a7 7 0 0 1 0 14',grip:'M8 5h.01 M16 5h.01 M8 12h.01 M16 12h.01 M8 19h.01 M16 19h.01',resize:'m13 20 7-7 M7 20 13 14',table:'M3 3h18v18H3z M3 9h18 M9 3v18 M3 15h18',hash:'M5 9h14 M4 15h14 M10 3 6 21 M18 3l-4 18',sliders:'M3 6h6 M13 6h8 M3 18h12 M19 18h2 M9 3v6 M15 15v6 M3 12h12 M19 12h2 M15 9v6',power:'M12 2v10 M6 5a9 9 0 1 0 12 0',file:'M5 3h9l5 5v13H5z M14 3v6h5 M8 13h8 M8 17h6',code:'m8 6-6 6 6 6 m8-12 6 6-6 6 M14 3l-4 18',link:'m10 8 3-3a4 4 0 0 1 6 6l-3 3 M14 16l-3 3a4 4 0 0 1-6-6l3-3 M8 16l8-8',refresh:'M20 7v5h-5 M4 17v-5h5 M5 7a8 8 0 0 1 14-2l1 2 M4 17l1 2a8 8 0 0 0 14-2',sun:'M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1 1 M18 18l1 1 M5 19l1-1 M18 6l1-1 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',moon:'M20 15A9 9 0 0 1 9 3a9 9 0 1 0 11 12',info:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 11v6 M12 7h.01',panel:'M3 4h18v16H3z M9 4v16',external:'M14 3h7v7 M21 3 10 14 M10 3H3v18h18v-7',disconnect:'m3 3 18 18 M8 8l-3 3a4 4 0 0 0 6 6l2-2 M13 7l2-2a4 4 0 0 1 6 6l-2 2'};
 const icon=(name,cls='')=>`<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.grid}"/></svg>`;
 const button=(label,action,opts={})=>`<button type="button" class="btn ${opts.primary?'primary':''} ${opts.danger?'danger':''} ${opts.quiet?'quiet':''} ${opts.iconOnly?'icon-only':''}" data-action="${action}" ${opts.id?`data-id="${e(opts.id)}"`:''} ${opts.disabled?'disabled':''} ${opts.iconOnly?`aria-label="${e(label)}" title="${e(label)}"`:''}>${opts.icon?icon(opts.icon):''}${opts.iconOnly?'':e(label)}</button>`;
 const link=(label,to,cls='',ico='')=>`<a class="${cls}" href="#${e(to)}">${ico?icon(ico):''}<span>${e(label)}</span></a>`;
 const badge=(label)=>{const lower=label.toLowerCase(),bad=/fail|disconnect|full|interrupt|invalid|uncertain|error/.test(lower),warn=/pending|start|prepar|request|reconnect|frozen|not configured|unavailable/.test(lower),good=/ready|recording|acquiring|complete|saved|applied|connected/.test(lower);return `<span class="badge ${bad?'bad':warn?'warn':good?'good':'neutral'}">${icon(bad?'alert':warn?'clock':good?'check':'file')}<span>${e(label)}</span></span>`;};
 const field=(label,content,help='')=>`<label class="field od-field"><span>${e(label)}</span>${content}${help?`<small>${e(help)}</small>`:''}</label>`;
 const input=(name,value='',type='text',attrs='')=>`<input name="${e(name)}" value="${e(value)}" type="${type}" ${attrs}>`;
 const select=(name,value,choices,attrs='')=>`<select name="${e(name)}" ${attrs}>${choices.map(c=>{const v=typeof c==='string'?c:c.value,l=typeof c==='string'?c:c.label;return `<option value="${e(v)}" ${v===value?'selected':''}>${e(l)}</option>`;}).join('')}</select>`;
 const empty=(title,action='')=>`<div class="empty">${icon('folder')}<h2>${e(title)}</h2>${action}</div>`;
 const name=text=>`<span class="name-reveal" tabindex="0" data-full-name="${e(text)}" aria-label="${e(text)}"><span class="od-truncate">${e(text)}</span></span>`;

 function breadcrumbs(current, ancestors){
  if(!ancestors){
   const [route,id]=window.App?.ui.route.split('/')||[];
   const preset=Cousins.getPreset(id),collection=Cousins.getCollection(id),device=Cousins.getDevice(id);
   ancestors=route==='home'?[]:[{label:'Home',route:'home'}];
   if(['editor','start'].includes(route)){ancestors.push({label:'Acquisition presets',route:'presets'});if(route==='start'&&preset)ancestors.push({label:preset.name,route:'editor/'+id});}
   if(['device','test','register'].includes(route)){ancestors.push({label:'Devices',route:'devices'});if(route==='test'&&device)ancestors.push({label:device.name,route:'device/'+id});}
   if(['collection','active'].includes(route)){ancestors.push({label:'Collections',route:'collections'});if(route==='active'&&collection)ancestors.push({label:collection.name,route:'collection/'+id});}
   if(route==='logs'){
    const back=window.Diagnostics?.state.returnRoute||'settings',parts=back.split('/'),run=Cousins.getCollection(parts[1]);
    if(run){ancestors.push({label:'Collections',route:'collections'},{label:run.name,route:back});}else ancestors.push({label:'Settings',route:'settings'});
   }
  }
  return `<nav class="breadcrumbs" aria-label="Breadcrumb"><ol>${ancestors.map(a=>`<li>${link(a.label,a.route)}${icon('right')}</li>`).join('')}<li aria-current="page">${e(current)}</li></ol></nav>`;
 }
 const header=(name,actions='',detail='')=>`<header class="page-header"><div class="header-identity">${breadcrumbs(name)}<h1>${e(name)}</h1>${detail}</div><div class="actions">${actions}</div></header>`;
 return {e,icon,button,link,badge,field,input,select,empty,name,breadcrumbs,header};
})();

(()=>{
 let tip,owner;
 function close(){if(tip)tip.hidden=true;owner?.removeAttribute('aria-describedby');owner=null;}
 function show(target){if(!target)return;if(!tip){tip=document.createElement('div');tip.id='full-name-tooltip';tip.className='full-name-tooltip';tip.role='tooltip';document.body.append(tip);}owner=target;tip.textContent=target.dataset.fullName;tip.hidden=false;target.setAttribute('aria-describedby',tip.id);const r=target.getBoundingClientRect();tip.style.left=Math.max(8,Math.min(r.left,innerWidth-tip.offsetWidth-8))+'px';tip.style.top=Math.max(8,Math.min(r.bottom+8,innerHeight-tip.offsetHeight-8))+'px';}
 document.addEventListener('pointerover',e=>show(e.target.closest('[data-full-name]')));
 document.addEventListener('pointerout',e=>{if(owner&&owner.contains(e.target)&&!owner.contains(e.relatedTarget))close();});
 document.addEventListener('focusin',e=>show(e.target.closest('[data-full-name]')));
 document.addEventListener('focusout',close);
 document.addEventListener('click',e=>{const target=e.target.closest('[data-full-name]');if(target){show(target);}else close();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')close();if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-full-name]')){e.preventDefault();show(e.target);}});
 document.addEventListener('scroll',close,true);
})();
