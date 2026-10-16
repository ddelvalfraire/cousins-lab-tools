window.Layout = (() => {
  const catalog = [
    {kind:'chart',name:'Chart',icon:'chart',section:'Visualize',description:'Time series, spectrum or scatter'},
    {kind:'numeric',name:'Metric',icon:'hash',section:'Visualize',description:'A channel value with its unit'},
    {kind:'results',name:'Results table',icon:'table',section:'Visualize',description:'Structured derived values'},
    {kind:'inputs',name:'Input form',icon:'sliders',section:'Configure',description:'Fields arranged in columns'},
    {kind:'calibration',name:'Calibration table',icon:'table',section:'Configure',description:'Repeated reference and measured values'},
    {kind:'control',name:'Device controls',icon:'power',section:'Operate',description:'Parameters and explicit commands'},
    {kind:'group',name:'Component group',icon:'grid',section:'Arrange',description:'An independent nested grid'}
  ];
  const defaults={chart:[8,4],numeric:[4,2],control:[4,3],inputs:[6,4],calibration:[6,4],results:[12,3],group:[12,5]};
  const fields=()=>[{id:'sample',label:'Sample ID',type:'text',value:'Sample 07',span:6},{id:'temperature',label:'Temperature',type:'number',unit:'°C',value:25,min:0,max:80,step:.1,span:3},{id:'replicates',label:'Replicates',type:'number',unit:'',value:3,min:1,max:20,step:1,span:3},{id:'blank',label:'Blank correction',type:'boolean',value:true,span:6},{id:'method',label:'Processing profile',type:'select',options:['Enzyme','Gas','Isotope','Fluorescence'],value:'Enzyme',span:6}];
  function create(kind,device='ms-1'){
    const entry=catalog.find(x=>x.kind===kind),[w,h]=defaults[kind];
    return Cousins.makeComponent('c-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,6),kind,entry.name,{device,channels:Cousins.getDevice(device)?.channels.slice(0,kind==='numeric'?1:2).map(x=>x.id)||[],x:0,y:0,w,h,children:kind==='group'?[]:undefined,fields:kind==='inputs'?fields():undefined,rows:kind==='calibration'?[['0','0'],['1','10'],['2','20']]:undefined});
  }
  const intersects=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
  function settle(items,id){
    const active=items.find(c=>c.id===id);if(!active)return;
    active.w=Math.min(12,Math.max(2,Number(active.w)||4));active.h=Math.max(2,Math.min(12,Number(active.h)||3));active.x=Math.max(0,Math.min(12-active.w,Number(active.x)||0));active.y=Math.max(0,Number(active.y)||0);
    const placed=[active];
    for(const c of items.filter(c=>c!==active).sort((a,b)=>a.y-b.y||a.x-b.x)){
      let hit;while((hit=placed.find(p=>intersects(c,p))))c.y=hit.y+hit.h;placed.push(c);
    }
  }
  function append(items,c){c.y=items.reduce((m,x)=>Math.max(m,x.y+x.h),0);items.push(c);return c;}
  function walk(items,fn){for(const c of items){fn(c,items);if(c.children)walk(c.children,fn);}}
  function find(items,id){let result;walk(items,(c,list)=>{if(c.id===id)result={component:c,list};});return result;}
  function migrate(preset){
    for(const view of preset.views){
      let y=0;
      view.components.forEach((c,i)=>{
        if(c.x===undefined){const [w,h]=defaults[c.kind]||[6,3];c.x=i===1&&view.components[0]?.kind==='chart'?8:0;c.y=i===1&&view.components[0]?.kind==='chart'?0:y;c.w=w;c.h=h;if(c.x===0)y+=h;}
        if(c.kind==='inputs'&&!c.fields)c.fields=fields().map(f=>({...f,value:f.id==='method'?preset.profile:f.value}));
        if(c.kind==='group'){c.children ||= [];}
      });
      if(view.components[0])settle(view.components,view.components[0].id);
    }
  }
  Cousins.db.presets.forEach(migrate);Cousins.db.collections.forEach(c=>migrate(c.preset));
  if(!Cousins.db.layoutVersion){
    for(const p of Cousins.db.presets){
      const v=p.views[0];if(v.components.length===3){const [chart,metric,control]=v.components;Object.assign(chart,{x:0,y:0,w:8,h:4});Object.assign(metric,{x:8,y:0,w:4,h:2});Object.assign(control,{x:8,y:2,w:4,h:4});const group=create('group',chart.device);group.title='Sample conditions';Object.assign(group,{x:0,y:4,w:8,h:4});const f=create('inputs',chart.device);f.title='Sample';Object.assign(f,{x:0,y:0,w:12,h:3});group.children=[f];v.components.push(group);}
    }
    Cousins.db.layoutVersion=2;Cousins.save();
  }
  return {catalog,create,fields,settle,append,walk,find,migrate};
})();
