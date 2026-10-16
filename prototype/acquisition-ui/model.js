window.Cousins = (() => {
  const clone = value => JSON.parse(JSON.stringify(value));
  const devices = [
    {id:'ms-1',name:'Mass spectrometer 01',kind:'Acquisition',status:'Ready',definition:'mass-spec.example.yaml',channels:[{id:'mz32',name:'m/z 32',unit:'counts/s',shape:'Scalar time series'},{id:'mz44',name:'m/z 44',unit:'counts/s',shape:'Scalar time series'},{id:'spectrum',name:'Mass spectrum',unit:'counts/s',shape:'Vector by m/z'}],commands:['Start','Stop'],parameter:'Sample interval',unit:'ms',min:10,max:1000,step:10,applied:100},
    {id:'ambit-1',name:'Ambit 01',kind:'Acquisition',status:'Ready',definition:'ambit.example.yaml',channels:[{id:'fluorescence',name:'Fluorescence',unit:'a.u.',shape:'Scalar time series'},{id:'reference',name:'Reference signal',unit:'a.u.',shape:'Scalar time series'}],commands:['Start','Stop'],parameter:'Integration time',unit:'ms',min:10,max:1000,step:10,applied:100},
    {id:'led-1',name:'LED controller 01',kind:'Control',status:'Ready',definition:'led.example.yaml',channels:[],commands:['Enable','Disable'],parameter:'LED output',unit:'%',min:0,max:100,step:1,applied:35}
  ];
  const makeComponent = (id,kind,title,extra={}) => ({id,kind,title,width:'full',device:'ms-1',channels:['mz32'],chartType:'line',color:'accent',thickness:2,axisMin:'',axisMax:'',showLegend:true,process:'raw',...extra});
  function template(id,name,profile,ambit=false){
    const source=ambit?'ambit-1':'ms-1';
    return {id,name,revision:1,profile,family:ambit?'Ambit':'Mass spectrometry',updated:'Oct 8, 2026',policy:'continue',devices:ambit?['ambit-1','led-1']:['ms-1'],views:[
      {id:'signals',name:'Signals',components:[
        makeComponent(id+'-chart','chart',ambit?'Fluorescence over time':'Ion signal over time',{device:source,channels:ambit?['fluorescence','reference']:['mz32','mz44']}),
        makeComponent(id+'-value','numeric',ambit?'Fluorescence':'m/z 32 signal',{device:source,channels:ambit?['fluorescence']:['mz32'],width:'half'}),
        makeComponent(id+'-control','control',ambit?'LED output':'Acquisition settings',{device:ambit?'led-1':'ms-1',width:'half'})
      ]},
      {id:'processing',name:'Processing & results',components:[
        makeComponent(id+'-params','inputs','Profile parameters',{profile,device:source}),
        makeComponent(id+'-cal','calibration','Calibration points',{device:source,rows:[['0','0'],['1','10'],['2','20']]}),
        makeComponent(id+'-results','results',profile+' results',{device:source,profile,process:profile.toLowerCase()})
      ]}
    ]};
  }
  const presets=[template('ms-enzyme','Enzyme activity','Enzyme'),template('ms-gas','Gas exchange','Gas'),template('ms-isotope','Isotope tracing','Isotope'),template('ambit','LED fluorescence','Fluorescence',true)];
  function collection(id,name,preset,completed){
    return {id,name,preset:clone(preset),created:'Oct 8, 2026 · 09:42',seconds:completed?600:84,acquisition:completed?'Completed':'Acquiring',recording:completed?'Saved':'Recording',viewing:completed?'Completed':'Live',interval:60,cursor:completed?600:0,storage:'Recordings',policy:preset.policy,view:'signals',deviceStates:Object.fromEntries(preset.devices.map(d=>[d,{connection:'Connected',command:completed?'Completed':'Acknowledged',operation:completed?'Stopped':'Active',applied:devices.find(x=>x.id===d)?.applied||0,draft:null}])),events:[{time:'00:00',text:'Preset revision '+preset.revision+' captured.'},{time:'00:01',text:completed?'Recording saved.':'Acquisition acknowledged.'}],files:[{id:'f1',name:'segment-001.parquet',schema:preset.family==='Ambit'?'fluorescence':'ion-signal',unit:preset.family==='Ambit'?'a.u.':'counts/s',start:0,end:300,rows:301,source:preset.family==='Ambit'?'ambit-1':'ms-1'},{id:'f2',name:'segment-002.parquet',schema:preset.family==='Ambit'?'fluorescence':'ion-signal',unit:preset.family==='Ambit'?'a.u.':'counts/s',start:301,end:600,rows:300,source:preset.family==='Ambit'?'ambit-1':'ms-1'},{id:'f3',name:'auxiliary-reference.parquet',schema:'reference',unit:'V',start:0,end:600,rows:601,source:'aux-example'}],derived:true};
  }
  const initial={schema:1,devices,presets,collections:[collection('run-ambit','Leaf response · morning',presets[3],false),collection('run-ms','Enzyme assay · batch 07',presets[0],true)],appearance:'system',version:'0.8.2',analyticsEndpoint:''};
  let db=clone(initial);
  try{const stored=JSON.parse(localStorage.getItem('cousins-prototype-v1'));if(stored?.schema===1&&Array.isArray(stored.presets)&&Array.isArray(stored.collections))db=stored;}catch{}
  function save(){try{localStorage.setItem('cousins-prototype-v1',JSON.stringify(db));return true;}catch{return false;}}
  const getPreset=id=>db.presets.find(p=>p.id===id);
  const getCollection=id=>db.collections.find(c=>c.id===id);
  const getDevice=id=>db.devices.find(d=>d.id===id);
  const duration=n=>String(Math.floor(n/3600)).padStart(2,'0')+':'+String(Math.floor(n/60)%60).padStart(2,'0')+':'+String(Math.floor(n)%60).padStart(2,'0');
  const signal=(second,index=0)=>Math.max(0,32+index*12+10*Math.sin(second/13+index)+4*Math.sin(second/4+index)+second/60);
  const channelInfo=(device,id)=>getDevice(device)?.channels.find(c=>c.id===id);
  function newCollection(name,preset){const item=collection('run-'+Date.now(),name,preset,false);item.seconds=0;item.acquisition='Starting';item.recording='Preparing';item.deviceStates=Object.fromEntries(preset.devices.map(id=>[id,{connection:'Connecting',command:'Requested',operation:'Starting',applied:getDevice(id)?.applied||0,draft:null}]));db.collections.unshift(item);save();return item;}
  return {db,clone,save,getPreset,getCollection,getDevice,duration,signal,channelInfo,newCollection,makeComponent,initial};
})();
