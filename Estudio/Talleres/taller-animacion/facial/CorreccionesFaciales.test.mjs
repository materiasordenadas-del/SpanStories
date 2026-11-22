import test from 'node:test';
import assert from 'node:assert/strict';
import {copy,validatePreset} from './FacialCore.mjs';
import {BASE_PRESETS} from './FacialPresets.mjs';
import {actingPreset} from './ActingLibrary.mjs';
import * as C from './CorreccionesFaciales.mjs';

const smile=()=>copy(BASE_PRESETS.find(p=>p.id==='joy.soft.01'));

test('diferencia → aplicar devuelve exactamente el gesto editado (solo se guardan las curvas cambiadas)',()=>{
  const original=smile(),edited=copy(original);
  edited.channels.mouthSmileLeft=edited.channels.mouthSmileLeft.map(([t,v])=>[t,v*.5]);
  delete edited.channels.cheekSquintRight;
  edited.channels.browInnerUp=[[0,0],[1,.3],[original.duration,0]];
  const parche=C.diferenciaPreset(original,edited);
  assert.deepEqual(Object.keys(parche.channels).sort(),['browInnerUp','cheekSquintRight','mouthSmileLeft']);
  assert.equal(parche.channels.cheekSquintRight,null);
  assert.deepEqual(C.aplicarParchePreset(original,parche).channels,edited.channels);
  assert.equal(C.diferenciaPreset(original,copy(original)),null);
});

test('cambiar la duración guarda todas las curvas y el resultado sigue siendo válido',()=>{
  const original=copy(actingPreset('behavior-12','F')),edited=copy(original),k=edited.duration*1.5;
  edited.duration=k;for(const c of Object.keys(edited.channels))edited.channels[c]=edited.channels[c].map(([t,v])=>[t*1.5,v]);
  const parche=C.diferenciaPreset(original,edited);
  assert.equal(Object.keys(parche.channels).length,Object.keys(original.channels).length);
  const out=C.aplicarParchePreset(original,parche);validatePreset(out);assert.equal(out.duration,k);
});

test('documento de correcciones: valida, se aplica a presets, actuaciones, vida y visemas, y se restaura',()=>{
  const original=smile(),edited=copy(original);edited.channels.mouthSmileLeft=edited.channels.mouthSmileLeft.map(([t,v])=>[t,v*.5]);
  const doc={schema:C.SCHEMA,version:1,revision:3,items:{
    'joy.soft.01':{tipo:'preset',parche:C.diferenciaPreset(original,edited),guardado:'2026-11-17T10:00:00.000Z'},
    'vida.feliz':{tipo:'vida',parche:{pesos:{jawOpen:null,mouthSmileLeft:.5}},guardado:'2026-11-17T10:00:00.000Z'},
    'visema.vis_A':{tipo:'visema',parche:{pesos:{jawOpen:.7}},guardado:'2026-11-17T10:00:00.000Z'}}};
  C.usarCorrecciones(doc);
  const lista=[smile(),copy(BASE_PRESETS[1])];C.corregirLista(lista);
  assert.deepEqual(lista[0].channels.mouthSmileLeft,edited.channels.mouthSmileLeft);
  assert.equal(lista[0].source.correccion,'2026-11-17T10:00:00.000Z');
  assert.deepEqual(lista[1].channels,BASE_PRESETS[1].channels,'los demás presets no cambian');
  // Las variantes propias de una historia («user.*») no se tocan.
  const variante={...smile(),id:'user.x',source:{...smile().source,componente:'joy.soft.01'}};assert.equal(C.corregirPreset(variante),variante);
  assert.equal(C.componenteDe(variante),'joy.soft.01');
  const proyecto={schema:'spanstories.facial-project',version:1,presets:[smile(),variante],instances:[],favorites:[]};
  const {project,cambiados}=C.corregirProyecto(proyecto);assert.deepEqual(cambiados,['joy.soft.01']);assert.equal(project.presets[1],variante);
  const POSES={feliz:{cara:{mouthSmileLeft:.79,jawOpen:.13},cabeza:[0,0,0,0,0]},triste:{cara:{browInnerUp:.6},cabeza:[0,0,0,0,0]}};
  C.corregirExpresionesVida(POSES);assert.deepEqual(POSES.feliz.cara,{mouthSmileLeft:.5});assert.deepEqual(POSES.triste.cara,{browInnerUp:.6});
  const VIS={vis_A:{jawOpen:.5,mouthUpperUpLeft:.1}};C.corregirVisemas(VIS);assert.equal(VIS.vis_A.jawOpen,.7);
  // Restaurar original: sin la corrección, todo vuelve a como estaba.
  C.usarCorrecciones(C.vacias());C.corregirExpresionesVida(POSES);C.corregirVisemas(VIS);C.corregirLista(lista);
  assert.deepEqual(POSES.feliz.cara,{mouthSmileLeft:.79,jawOpen:.13});assert.equal(VIS.vis_A.jawOpen,.5);assert.deepEqual(lista[0].channels,original.channels);
});

test('poses ↔ preset estático, y documentos mal formados se rechazan',()=>{
  const p=C.presetDePose('vida.feliz','Feliz',{mouthSmileLeft:.8,jawOpen:.1});
  assert.deepEqual(C.poseDePreset(p),{mouthSmileLeft:.8,jawOpen:.1});
  assert.deepEqual(C.diferenciaPose({a:1},{a:1}),null);
  assert.throws(()=>C.validarCorrecciones({schema:C.SCHEMA,version:1,revision:0,items:{'vida.feliz':{tipo:'preset',parche:{},guardado:'x'}}}));
  assert.throws(()=>C.validarCorrecciones({schema:C.SCHEMA,version:1,revision:0,items:{'joy.soft.01':{tipo:'preset',parche:{channels:{noExiste:null}},guardado:'x'}}}));
  assert.throws(()=>C.validarCorrecciones({schema:C.SCHEMA,version:1,revision:0,items:{'visema.vis_A':{tipo:'visema',parche:{pesos:{jawOpen:2}},guardado:'x'}}}));
});
