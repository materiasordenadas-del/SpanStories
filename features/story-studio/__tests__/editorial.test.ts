import {test} from 'node:test';
import assert from 'node:assert/strict';
import {InMemoryStoryRepository,createEditorialDraft,asId} from '../../story-engine/index.ts';
import {buildStudioRehearsal} from '../demo.ts';
import {readStoredSources,reviseDialogue,engineContent} from '../sources.ts';
import {validateProject} from '../model.ts';

test('editing a line produces a durable canonical draft and rebinds direction without copying text',async()=>{
  const {source,project}=buildStudioRehearsal(),repository=new InMemoryStoryRepository();
  const original=JSON.stringify(source),id=source.sentences[0].id;
  const result=await reviseDialogue({repository,source,project,sentenceId:id,text:'Hoy estamos en Barcelona.'});
  assert.equal(JSON.stringify(source),original);
  assert.equal(result.source.storyId,source.storyId);assert.notEqual(result.source.storyVersionId,source.storyVersionId);
  assert.equal(result.source.status,'DRAFT');assert.equal(result.project.revision,0);assert.notEqual(result.project.id,project.id);
  assert.equal(result.source.sentences[0].text,'Hoy estamos en Barcelona.');
  validateProject(result.project,result.source);
  assert(!JSON.stringify(result.project).includes('Hoy estamos'));
  const recovered=await readStoredSources(repository,[source]);assert.equal(recovered[0].storyVersionId,result.source.storyVersionId);
  assert.equal((await repository.getStoryVersion(asId('StoryVersionId',source.storyVersionId)))!.text,engineContent(source).content.version.text);
});

test('changed sentences lose stale annotations; unchanged anchors keep their exact meaning and bounds',()=>{
  const {source}=buildStudioRehearsal();const previous={...structuredClone(engineContent(source).content)};
  const versionId=previous.version.id;
  previous.anchors=[{id:asId('TextAnchorId','anchor-edit'),storyVersionId:versionId,sentenceId:previous.sentences[0].id,start:0,end:7},{id:asId('TextAnchorId','anchor-keep'),storyVersionId:versionId,sentenceId:previous.sentences[1].id,start:0,end:4}];
  let count=0;const draft=createEditorialDraft({previous,sentenceId:previous.sentences[0].id,text:'¡Hola! 👋',versionNumber:2,ids:{next:kind=>`${({StoryVersionId:'storyver',SentenceId:'sent',SurfaceTokenId:'tok',TextAnchorId:'anchor'} as Record<string,string>)[kind]??'id'}-test-${++count}`},clock:{now:()=>new Date('2026-10-26T00:00:00Z')}});
  assert.equal(draft.content.anchors.length,1);assert.equal(draft.content.anchors[0].start,0);assert.equal(draft.content.anchors[0].end,4);
  assert.equal(draft.annotationRequired,true);assert.equal(draft.content.version.status,'DRAFT');
  const sentence=draft.content.sentences[0];for(const token of sentence.tokens)assert.equal([...sentence.text].slice(token.startOffset,token.endOffset).join(''),token.surface);
  assert.throws(()=>createEditorialDraft({previous,sentenceId:previous.sentences[0].id,text:'',versionNumber:2,ids:{next:()=>''},clock:{now:()=>new Date()}}));
});
