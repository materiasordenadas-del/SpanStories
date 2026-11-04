import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PNG} from 'pngjs';
import {GeoService} from '../server/geo-service.js';
import {boundsAround} from '../src/geo/projection.js';
test('Terrarium decoding handles zero elevations, tile seams and repeat cache without another request',async()=>{
 const cacheDir=await mkdtemp(join(tmpdir(),'atlas-elevation-')),png=new PNG({width:256,height:256});for(let i=0;i<png.data.length;i+=4){png.data[i]=128;png.data[i+1]=0;png.data[i+2]=0;png.data[i+3]=255;}const bytes=PNG.sync.write(png);let calls=0;
 const service=new GeoService({cacheDir,fetchImpl:async()=>{calls++;return new Response(bytes);}});
 try{const bounds=boundsAround(0,0,600,450),data=await service.elevation(bounds,3);assert.equal(data.heights.length,9);assert.ok(data.heights.every(h=>h===0));assert.equal(data.tiles.length,4);const initial=calls;await service.elevation(bounds,3);assert.equal(calls,initial);assert.ok(data.credits.includes('U.S. Geological Survey'));}finally{for(const name of await readdir(cacheDir))await unlink(join(cacheDir,name));await rmdir(cacheDir);}
});
