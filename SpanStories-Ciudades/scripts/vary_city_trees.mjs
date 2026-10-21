import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {assignTreeVariety} from '../objetos/TreeVariety.js';
const file=new URL('../assets/barcelona-decor/layout.json',import.meta.url),layout=JSON.parse(await readFile(file,'utf8'));
const unchanged=structuredClone(layout.placements.map(p=>({id:p.id,position:p.position,pit:p.pit,other:p.kind==='tree'?null:p})));
layout.audit.variety=assignTreeVariety(layout.placements);
assert.equal(layout.audit.variety.repeatedNeighbors,0);
assert.deepEqual(layout.placements.map(p=>({id:p.id,position:p.position,pit:p.pit,other:p.kind==='tree'?null:p})),unchanged);
await writeFile(file,JSON.stringify(layout,null,2));console.log(JSON.stringify(layout.audit.variety));
