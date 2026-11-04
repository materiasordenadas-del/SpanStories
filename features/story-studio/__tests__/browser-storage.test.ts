import {test} from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {IndexedDBStoryRepository} from '../../story-engine/index.ts';
import {buildStudioRehearsal} from '../demo.ts';
import {engineContent,registerSource,reviseDialogue,readStoredSources} from '../sources.ts';
import {StudioMediaRepository} from '../browser-media.ts';

test('IndexedDB StoryRepository survives reopen, isolates owners and rejects duplicate/corrupt versions',async()=>{
  const factory=new IDBFactory(),{source,project}=buildStudioRehearsal();
  const first=new IndexedDBStoryRepository('author',factory),other=new IndexedDBStoryRepository('other',factory);
  await registerSource(first,source);
  const result=await reviseDialogue({repository:first,source,project,sentenceId:source.sentences[0].id,text:'Hola desde Barcelona.'});
  assert.equal(await other.getStoryVersion(engineContent(result.source).content.version.id),null);
  await first.close();
  const reopened=new IndexedDBStoryRepository('author',factory),stored=await readStoredSources(reopened,[source]);
  assert.equal(stored[0].sentences[0].text,'Hola desde Barcelona.');
  await assert.rejects(()=>reopened.saveNewVersion(engineContent(result.source).content));
  const content=engineContent(source).content;
  await assert.rejects(()=>reopened.saveNewVersion({...content,version:{...content.version,text:'Disconnected text'}}),/texto/);
  assert.equal((await reopened.getStoryVersion(content.version.id))!.text,content.version.text);
  await reopened.close();await other.close();
});

test('concurrent canonical imports and editorial writes preserve immutable versions',async()=>{
  const factory=new IDBFactory(),{source,project}=buildStudioRehearsal();
  const a=new IndexedDBStoryRepository('a',factory),b=new IndexedDBStoryRepository('a',factory);
  await Promise.all([registerSource(a,source),registerSource(b,source)]);
  const results=await Promise.allSettled([reviseDialogue({repository:a,source,project,sentenceId:source.sentences[0].id,text:'Versión A.'}),reviseDialogue({repository:b,source,project,sentenceId:source.sentences[0].id,text:'Versión B.'})]);
  assert(results.some(r=>r.status==='fulfilled'));
  const versions=await a.listVersions(engineContent(source).story.id);
  assert.equal(new Set(versions.map(v=>v.versionNumber)).size,versions.length);
  assert.equal(versions[0].text,engineContent(source).content.version.text);
  await a.close();await b.close();
});

test('changing a line detaches its old voice while retaining voices for unchanged lines',async()=>{
  const factory=new IDBFactory(),{source,project}=buildStudioRehearsal(),repo=new IndexedDBStoryRepository('a',factory);
  const first=project.scenes[0].sequences[0].cues[0],second=project.scenes[0].sequences[1].cues[0];
  if(first.kind==='dialogue')first.audioUrl='/audio/old.mp3';if(second.kind==='dialogue')second.audioUrl='/audio/keep.mp3';
  const next=await reviseDialogue({repository:repo,source,project,sentenceId:source.sentences[0].id,text:'Un texto nuevo.'});
  const updated=next.project.scenes[0].sequences[0].cues[0],unchanged=next.project.scenes[0].sequences[1].cues[0];
  assert.equal(updated.kind==='dialogue'?updated.audioUrl:undefined,undefined);
  assert.equal(unchanged.kind==='dialogue'?unchanged.audioUrl:undefined,'/audio/keep.mp3');
  assert.equal(first.kind==='dialogue'?first.audioUrl:undefined,'/audio/old.mp3');await repo.close();
});

test('audio assets deduplicate by content id and remain reusable after reopen',async()=>{
  const factory=new IDBFactory(),first=new StudioMediaRepository('a',factory),other=new StudioMediaRepository('b',factory);
  const blob=new Blob([new Uint8Array([1,2,3])],{type:'audio/wav'}),id='a'.repeat(64);
  await first.save({id,name:'voice.wav',kind:'voice',mimeType:'audio/wav',duration:1,bytes:3,createdAt:new Date().toISOString(),blob});
  await first.save({id,name:'duplicate.wav',kind:'sound',mimeType:'audio/wav',duration:1,bytes:3,createdAt:new Date().toISOString(),blob});
  assert.equal((await first.list()).length,1);assert.equal((await first.get(id))!.name,'voice.wav');assert.equal(await other.get(id),null);
  await first.close();const reopened=new StudioMediaRepository('a',factory);assert.equal((await reopened.get(id))!.blob.size,3);
  await reopened.close();await other.close();
});
