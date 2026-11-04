import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getStoryOneReaderViewModel} from '../../story-reader/story-one.ts';
import {buildStudioRehearsal} from '../demo.ts';
import {readPublishedPresentation,storePublishedPresentation} from '../publication.ts';
import type {StudioSource} from '../model.ts';

test('published presentation uses a real published Story identity and remains immutable after author changes',async()=>{
  const reader=await getStoryOneReaderViewModel();
  const source:StudioSource={storyId:reader.storyId,storyVersionId:reader.storyVersionId,title:reader.title,status:reader.eventContext.version.status,blueprintId:reader.storyBlueprintId,sentences:reader.sentences,reader};
  const {project}=buildStudioRehearsal();project.storyId=source.storyId;project.storyVersionId=source.storyVersionId;
  project.scenes[0].sequences.forEach((s,i)=>{for(const cue of s.cues)if(cue.kind==='dialogue')cue.sentenceId=source.sentences[i].id;});
  const records=new Map<string,string>(),storage={getItem:(id:string)=>records.get(id)??null,setItem:(id:string,value:string)=>{records.set(id,value);}};
  const release={id:'publication-test-20261026',publishedAt:new Date().toISOString(),project};
  storePublishedPresentation(storage,release,source);
  project.scenes[0].name='A later author edit';
  const loaded=readPublishedPresentation(storage,release.id,[source]);
  assert.notEqual(loaded.release.project.scenes[0].name,project.scenes[0].name);
  assert.equal(loaded.source.storyVersionId,reader.storyVersionId);
  assert(![...records.values()][0].includes(reader.sentences[0].text));
  assert.throws(()=>storePublishedPresentation(storage,release,source),/sobrescribirse/);
  assert.throws(()=>storePublishedPresentation(storage,{...release,id:'draft-publication'},{...source,status:'DRAFT'}),/publicada/);
  assert.throws(()=>readPublishedPresentation(storage,release.id,[{...source,status:'DRAFT'}]),/disponible/);
  assert.throws(()=>readPublishedPresentation(storage,'../source',[source]),/inválida/);
});
