import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {STYLE_CATALOG,STYLE_MODES,mergeStyleState,styleId,StylePoolClient} from '../src/estudio/render/style-pool.js';
import {readStyles,writeStyles} from '../server/style-pool.js';
test('catálogo único de seis estilos y migración de estilos retirados',()=>{
  assert.deepEqual(STYLE_CATALOG.map(s=>s.id),['spanstories','zelda','ghibli','dispatch','color','colorline']);
  assert.equal(STYLE_MODES.dispatch,8);assert.equal(styleId('line'),'colorline');assert.equal(styleId('clay'),'color');
  const s=mergeStyleState({}, {styles:{zelda:{paint:999,contrast:NaN,unknown:3}}});
  assert.equal(s.styles.zelda.paint,2);assert.equal(s.styles.zelda.contrast,1.15);assert.equal(s.styles.zelda.unknown,undefined);
});
test('ediciones concurrentes de ambas aplicaciones preservan ajustes independientes',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'spanstyles-')),file=join(dir,'settings.json');
  try{
    await Promise.all([writeStyles({styles:{zelda:{paint:.4}}},file),writeStyles({active:'dispatch',styles:{dispatch:{lineWidth:2.3}}},file)]);
    const s=await readStyles(file);assert.equal(s.revision,2);assert.equal(s.active,'dispatch');assert.equal(s.styles.zelda.paint,.4);assert.equal(s.styles.dispatch.lineWidth,2.3);
    await writeStyles({active:'zelda'},file);assert.equal((await readStyles(file)).styles.zelda.paint,.4);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('el cliente recibe revisión cero y agrupa el arrastre sin perder campos',async t=>{
  let state=mergeStyleState({}, {active:'ghibli'}),posts=0,changes=0;
  t.mock.method(globalThis,'fetch',async(_url,options)=>{
    if(options?.method==='POST'){posts++;state=mergeStyleState(state,JSON.parse(options.body));state.revision++;}
    return {ok:true,json:async()=>structuredClone(state)};
  });
  const client=new StylePoolClient({onChange:()=>changes++});
  try{
    await client.pull();assert.equal(client.state.active,'ghibli');assert.equal(changes,1);
    for(let i=0;i<20;i++)client.change({styles:{ghibli:{contrast:1+i/100}}});
    client.change({styles:{dispatch:{lineWidth:2}}});
    await client.flush();assert.equal(posts,1);assert.equal(state.styles.ghibli.contrast,1.19);assert.equal(state.styles.dispatch.lineWidth,2);
  }finally{client.dispose();}
});
