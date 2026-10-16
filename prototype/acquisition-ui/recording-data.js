window.RecordingData = (() => {
  const drafts = new Map();
  let returnFocus;
  const schemas = {
    'ion-signal': [{id:'mz32',name:'m/z 32',unit:'counts/s'}, {id:'mz44',name:'m/z 44',unit:'counts/s'}],
    fluorescence: [{id:'fluorescence',name:'Fluorescence',unit:'a.u.'}, {id:'reference',name:'Reference signal',unit:'a.u.'}],
    reference: [{id:'value',name:'Reference voltage',unit:'V'}]
  };
  function channels(collection, file) {
    if (schemas[file.schema]) return schemas[file.schema].map(channel => ({...channel,unit:file.unit}));
    const device=Cousins.getDevice(file.source);
    return device?.channels.filter(ch=>!ch.shape.startsWith('Vector')&&ch.unit===file.unit).map(ch=>({...ch})) || [{id:'value',name:'Value',unit:file.unit}];
  }
  function exportChannels(collection) {
    return [...new Map(collection.files.flatMap(file=>channels(collection,file)).map(channel=>[channel.id,channel])).values()];
  }
  function samples(collection,file) {
    const fields=channels(collection,file),count=Math.max(0,Math.floor(file.rows));
    return Array.from({length:count},(_,i)=>{
      const time=Number((file.start+(count>1?(file.end-file.start)*i/(count-1):0)).toFixed(6));
      const row={collection_id:collection.id,collection_name:collection.name,source_id:file.source,file_name:file.name,schema:file.schema,provenance:'Synthetic sample',time_s:time,unit:file.unit};
      fields.forEach((channel,index)=>{row[channel.id]=Number((Cousins.signal(time,index)/(file.schema==='reference'?100:1)).toFixed(3));});
      return row;
    });
  }
  function download(content,name,type) {
    const url=URL.createObjectURL(new Blob([content],{type})),anchor=document.createElement('a');
    anchor.href=url;anchor.download=name;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  async function parquet(collectionId,fileId,button) {
    const collection=Cousins.getCollection(collectionId),file=collection?.files.find(f=>f.id===fileId);
    if(!file){App.toast('This recording file is unavailable.');return;}
    const label=button.innerHTML;button.disabled=true;button.setAttribute('aria-busy','true');button.textContent='Preparing…';
    await new Promise(resolve=>setTimeout(resolve,30));
    try {
      if(!window.ParquetWriter?.parquetWriteBuffer)throw Error('The Parquet writer could not load. Reload this page and try again.');
      const rows=samples(collection,file);if(!rows.length)throw Error('This file has no sample rows to download.');
      const metadata=['collection_id','collection_name','source_id','file_name','schema','provenance','unit'];
      const columnData=[...metadata.map(name=>({name,type:'STRING',data:rows.map(row=>row[name])})),{name:'time_s',type:'DOUBLE',data:rows.map(row=>row.time_s)},...channels(collection,file).map(ch=>({name:ch.id,type:'DOUBLE',data:rows.map(row=>row[ch.id])}))];
      const bytes=ParquetWriter.parquetWriteBuffer({columnData});
      download(bytes,file.name,'application/vnd.apache.parquet');
      App.toast('Downloaded '+file.name);
      Capture.add({source:'Export',eventType:'export.parquet',collectionId:collection.id,message:'Parquet sample downloaded.',details:{file:file.name,rows:rows.length},provenance:'Synthetic sample'});
    } catch(error) {
      App.toast(error.message||'Could not prepare this file. Try again.');
      Capture.add({severity:'error',source:'Export',eventType:'export.parquet.failed',collectionId:collection.id,message:error.message});
    } finally {button.disabled=false;button.removeAttribute('aria-busy');button.innerHTML=label;}
  }
  function saveDraft(form) {
    const data=new FormData(form);drafts.set(form.dataset.collection,{files:data.getAll('files'),channels:data.getAll('channels'),from:data.get('from'),to:data.get('to'),identity:data.has('identity')});
  }
  function openCsv(id) {
    const collection=Cousins.getCollection(id);if(!collection)return;
    let dialog=document.getElementById('export-dialog');
    if(!dialog){dialog=document.createElement('dialog');dialog.id='export-dialog';dialog.className='export-dialog';dialog.setAttribute('aria-labelledby','export-title');document.body.append(dialog);}
    if(dialog.open)return;
    returnFocus=document.activeElement;
    dialog.innerHTML=Pages.exportForm(collection);
    const form=dialog.querySelector('form'),draft=drafts.get(id);
    if(draft){for(const element of form.elements){if(element.name==='files'||element.name==='channels')element.checked=draft[element.name].includes(element.value);else if(element.name==='identity')element.checked=draft.identity;else if(element.name==='from'||element.name==='to')element.value=draft[element.name];}}
    dialog.onclose=()=>{saveDraft(form);if(App.ui.route.endsWith('/export')){App.ui.route='collection/'+id;try{history.replaceState(null,'','#'+App.ui.route);}catch{}}if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});else document.querySelector('.collection-detail .section-heading a')?.focus();};
    dialog.showModal();dialog.querySelector('input')?.focus();
  }
  function closeCsv(){document.getElementById('export-dialog')?.close();}
  async function csv(form) {
    const error=document.getElementById('export-error'),status=document.getElementById('export-status');
    error.textContent='';status.textContent='';saveDraft(form);
    const data=new FormData(form),collection=Cousins.getCollection(form.dataset.collection),chosen=collection.files.filter(file=>data.getAll('files').includes(file.id));
    const from=Number(data.get('from')),to=Number(data.get('to')),selected=data.getAll('channels');
    const fail=message=>{error.textContent=message;error.focus();};
    if(!chosen.length)return fail('Select at least one file.');
    if(data.get('from')===''||data.get('to')===''||!Number.isFinite(from)||!Number.isFinite(to)||from<0||to<from)return fail('Enter a start of 0 or greater and an end at or after it.');
    if(new Set(chosen.map(f=>f.schema+'|'+f.unit)).size>1)return fail('These files use different schemas or units. Select matching segments, or export the reference file separately.');
    const fields=channels(collection,chosen[0]).filter(ch=>selected.includes(ch.id));
    if(!fields.length)return fail('Select a channel belonging to the chosen files.');
    const submit=form.querySelector('[type="submit"]');submit.disabled=true;submit.setAttribute('aria-busy','true');status.textContent='Preparing CSV…';
    await new Promise(resolve=>setTimeout(resolve,30));
    try {
      const records=chosen.flatMap(file=>samples(collection,file)).filter(row=>row.time_s>=from&&row.time_s<=to);
      if(!records.length){status.textContent='';return fail('No samples fall within that interval. Change the range or selected files.');}
      const columns=[...(data.has('identity')?['collection_id','collection_name','source_id','file_name']:[]),'time_s',...fields.map(ch=>ch.id),'unit','provenance'];
      const rows=[columns,...records.map(row=>columns.map(name=>row[name]))];
      const text=rows.map(row=>row.map(value=>'"'+String(value??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
      download(text,collection.name.replace(/[^a-z0-9]+/gi,'-')+'.csv','text/csv;charset=utf-8');
      status.textContent=records.length.toLocaleString()+' sample rows downloaded.';
      Capture.add({source:'Export',eventType:'export.csv',collectionId:collection.id,message:'CSV sample downloaded.',details:{files:chosen.map(f=>f.name),rows:records.length},provenance:'Synthetic sample'});
    } catch(errorValue){status.textContent='';fail('Could not prepare CSV. '+errorValue.message);}
    finally {submit.disabled=false;submit.removeAttribute('aria-busy');}
  }
  return {channels,exportChannels,samples,parquet,openCsv,closeCsv,csv};
})();
