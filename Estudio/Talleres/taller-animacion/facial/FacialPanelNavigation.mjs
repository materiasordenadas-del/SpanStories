/** Shortcuts to the existing panels. Moving between them never hides controls or changes a project. */
export function mountFacialPanelNavigation({container,expressions,lifeSections=[],webcam=null,initial='expressions'}){
  const sections=new Map(lifeSections.map(section=>[section.querySelector('summary')?.textContent,section]));
  const life=sections.get('Vida del personaje'),manual=sections.get('Controles manuales');
  const nav=document.createElement('nav');nav.className='facial-panel-nav';nav.setAttribute('aria-label','Paneles del taller facial');
  const targets=[{id:'life',label:'LifeCharacter',target:life},{id:'animation',label:'Animación y controles',target:manual},{id:'expressions',label:'Expresiones',target:expressions}];
  if(webcam)targets.push({id:'webcam',label:'Webcam',target:webcam});
  function show(id){
    const item=targets.find(item=>item.id===id);if(!item?.target)return;
    if(item.target.tagName==='DETAILS')item.target.open=true;
    if(id==='life'){const speech=sections.get('Habla');if(speech)speech.open=true;}
    if(id==='animation')for(const detail of manual.querySelectorAll('details'))if(detail.querySelector('summary')?.textContent.startsWith('Clips del modelo'))detail.open=true;
    for(const button of nav.querySelectorAll('button')){const active=button.dataset.panel===id;button.dataset.active=String(active);if(active)button.setAttribute('aria-current','location');else button.removeAttribute('aria-current');}
    item.target.scrollIntoView({block:'start',behavior:'instant'});
  }
  for(const item of targets){const button=document.createElement('button');button.type='button';button.textContent=item.label;button.dataset.panel=item.id;button.disabled=!item.target;button.onclick=()=>show(item.id);nav.append(button);}
  container.prepend(nav);
  requestAnimationFrame(()=>{if(container.contains(nav))show(initial);});
  return nav;
}
