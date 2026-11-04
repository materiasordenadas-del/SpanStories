import { asId, createEditorialDraft, RandomIdGenerator, SystemClock, type NewVersionInput, type Story, type StoryRepository } from '../story-engine/index.ts';
import { buildReaderSegments } from '../story-reader/segments.ts';
import { buildSurfaceWordPanel } from '../story-reader/word-panel.ts';
import type { StoryReaderLexicalEntry, StoryReaderSurfaceEntry, StoryReaderViewModel } from '../story-reader/model.ts';
import type { StudioProject, StudioSource } from './model.ts';

export function engineContent(source:StudioSource):{story:Story;content:NewVersionInput}{
  if(source.engine)return source.engine;
  const context=source.reader?.eventContext;
  if(!context)throw new Error('Esta Story no dispone de contenido canónico para editar.');
  return {story:context.story,content:{version:context.version,sentences:context.sentences,anchors:context.anchors,occurrences:context.occurrences,targetBindings:context.targetBindings}};
}

export async function registerSource(repository:StoryRepository,source:StudioSource){
  const {story,content}=engineContent(source);
  if(!await repository.getStory(story.id))await repository.saveStory(story);
  const existing=await repository.getStoryVersion(content.version.id);
  if(existing){if(existing.text!==content.version.text||existing.title!==content.version.title)throw new Error('La misma versión de la Story contiene textos distintos. No se ha sobrescrito.');return;}
  try{await repository.saveNewVersion(content);}catch(error){const concurrent=await repository.getStoryVersion(content.version.id);if(!concurrent||concurrent.text!==content.version.text||concurrent.title!==content.version.title)throw error;}
}

/** Rebuilds the existing reader model from canonical rows, retaining known lexical identities on unchanged sentences. */
export function sourceFromContent(base:StudioSource,story:Story,content:NewVersionInput):StudioSource{
  const previous=engineContent(base).content;
  const lexicalEntries:Record<string,StoryReaderLexicalEntry>={},surfaceEntries:Record<string,StoryReaderSurfaceEntry>={};
  const anchors=new Map(content.anchors.map(a=>[a.id,a]));
  for(const sentence of content.sentences){
    const oldSentence=previous.sentences.find(s=>s.order===sentence.order&&s.text===sentence.text);
    for(const token of sentence.tokens){
      const oldToken=oldSentence?.tokens.find(t=>t.startOffset===token.startOffset&&t.endOffset===token.endOffset&&t.surface===token.surface);
      const oldEntry=oldToken?base.reader?.surfaceEntries[oldToken.id]:undefined;
      surfaceEntries[token.id]=oldEntry?{...oldEntry,tokenId:token.id,context:sentence.text,panel:{...oldEntry.panel,id:token.id}}:{tokenId:token.id,surface:token.surface,context:sentence.text,panel:buildSurfaceWordPanel(token,sentence)};
    }
    if(!oldSentence||!base.reader)continue;
    for(const occurrence of content.occurrences.filter(o=>o.sentenceId===sentence.id)){
      const first=anchors.get(occurrence.parts[0]?.anchorId);
      const oldOccurrence=previous.occurrences.find(o=>o.sentenceId===oldSentence.id&&o.kind===occurrence.kind&&o.surface===occurrence.surface&&previous.anchors.find(a=>a.id===o.parts[0]?.anchorId)?.start===first?.start);
      const entry=oldOccurrence?base.reader.lexicalEntries[oldOccurrence.id]:undefined;
      if(entry)lexicalEntries[occurrence.id]={...entry,occurrenceId:occurrence.id,context:sentence.text,panel:{...entry.panel,id:occurrence.id}};
    }
  }
  const focus=new Set(content.targetBindings.filter(b=>b.salience==='FOCUS').map(b=>b.occurrenceId));
  const reader:StoryReaderViewModel={
    storyBlueprintId:base.blueprintId??'',storyId:story.id,storyVersionId:content.version.id,title:content.version.title,
    sentences:content.sentences.map(sentence=>({id:sentence.id,text:sentence.text,presentation:'PARAGRAPH',segments:buildReaderSegments(sentence,content.anchors,content.occurrences,new Set(sentence.tokens.filter(t=>/[\p{L}\p{N}]/u.test(t.surface)).map(t=>t.id)),new Set(),focus)})),
    scenes:base.reader?.scenes??[],lexicalEntries,surfaceEntries,
    ...(base.reader?.eventContext?{eventContext:{...base.reader.eventContext,story,version:content.version,sentences:content.sentences,anchors:content.anchors,occurrences:content.occurrences,targetBindings:content.targetBindings}}:{}),
  };
  return {storyId:story.id,storyVersionId:content.version.id,title:content.version.title,status:content.version.status,blueprintId:story.storyBlueprintId,versionNumber:content.version.versionNumber,sentences:content.sentences,reader,engine:{story,content}};
}

export async function readStoredSources(repository:StoryRepository,bases:readonly StudioSource[]){
  const sources:StudioSource[]=[];
  for(const base of bases){
    await registerSource(repository,base);
    const story=await repository.getStory(asId('StoryId',base.storyId));
    for(const version of await repository.listVersions(asId('StoryId',base.storyId))){
      if(version.id===base.storyVersionId||!story)continue;
      const content:NewVersionInput={version,sentences:await repository.listSentences(version.id),anchors:await repository.listAnchors(version.id),occurrences:await repository.listOccurrences(version.id),targetBindings:await repository.listTargetBindings(version.id)};
      sources.push(sourceFromContent(base,story,content));
    }
  }
  return sources;
}

export async function reviseDialogue(input:{repository:StoryRepository;source:StudioSource;project:StudioProject;sentenceId:string;text:string}){
  const {repository,source,project}=input;
  await registerSource(repository,source);
  const previous=engineContent(source),versions=await repository.listVersions(previous.story.id);
  const draft=createEditorialDraft({previous:previous.content,sentenceId:input.sentenceId,text:input.text,versionNumber:Math.max(...versions.map(v=>v.versionNumber))+1,ids:new RandomIdGenerator(),clock:new SystemClock()});
  await repository.saveNewVersion(draft.content);
  const nextProject=structuredClone(project);
  nextProject.id=`${project.id.replace(/-storyv\d+$/,'')}-storyv${draft.content.version.versionNumber}`;
  nextProject.storyVersionId=draft.content.version.id;nextProject.revision=0;
  for(const scene of nextProject.scenes)for(const sequence of scene.sequences)for(const cue of sequence.cues)if(cue.kind==='dialogue'){
    if(cue.sentenceId===input.sentenceId&&draft.annotationRequired)delete cue.audioUrl;
    cue.sentenceId=draft.sentenceIds.get(cue.sentenceId)??cue.sentenceId;
  }
  return {source:sourceFromContent(source,previous.story,draft.content),project:nextProject,annotationRequired:draft.annotationRequired};
}
