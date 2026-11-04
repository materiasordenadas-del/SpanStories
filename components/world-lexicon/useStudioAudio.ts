"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {StudioMediaRepository,localAudioId,type StudioAudioAsset} from '@/features/story-studio/browser-media';
import type {StudioDirector} from '@/features/story-studio/director';

export function useStudioAudio(owner:string,playback:ReturnType<StudioDirector['snapshot']>){
  const repository=useRef<StudioMediaRepository|null>(null),audio=useRef(new Map<string,HTMLAudioElement>()),sources=useRef(new Map<string,string>()),urls=useRef(new Map<string,Promise<string>>()),ownedURLs=useRef(new Set<string>()),disposed=useRef(false);
  const [assets,setAssets]=useState<StudioAudioAsset[]>([]),[error,setError]=useState<string|null>(null);
  useEffect(()=>{
    disposed.current=false;const store=new StudioMediaRepository(owner);repository.current=store;
    void store.list().then(rows=>{if(!disposed.current)setAssets(rows);}).catch(e=>{if(!disposed.current)setError(e instanceof Error?e.message:'No se pudo abrir la biblioteca.');});
    const media=audio.current,leased=ownedURLs.current,cache=urls.current;
    return()=>{disposed.current=true;repository.current=null;for(const element of media.values()){element.pause();element.src='';}media.clear();for(const url of leased)URL.revokeObjectURL(url);leased.clear();cache.clear();void store.close().catch(()=>{});};
  },[owner]);
  const resolve=useCallback((url:string)=>{
    let pending=urls.current.get(url);
    if(!pending){pending=(async()=>{
      const id=localAudioId(url);if(!id)return new URL(url,location.href).href;
      if(!repository.current)throw new Error('La biblioteca de audio todavía no está lista.');
      const asset=await repository.current.get(id);if(!asset)throw new Error('Este archivo de audio no está disponible en el navegador.');
      if(disposed.current)throw new Error('La biblioteca se cerró.');
      const result=URL.createObjectURL(asset.blob);ownedURLs.current.add(result);return result;
    })();urls.current.set(url,pending);}
    return pending;
  },[]);
  useEffect(()=>{
    let cancelled=false;
    const active=[...playback.stage.sounds,...(playback.stage.dialogue?.audioUrl?[playback.stage.dialogue]:[])],ids=new Set(active.map(c=>c.id));
    for(const [id,element]of audio.current){if(id==='preview'){if(playback.state==='playing')element.pause();continue;}if(playback.state!=='playing'||!ids.has(id))element.pause();}
    if(playback.state!=='playing')return;
    for(const cue of active)void(async()=>{
      const uri=cue.audioUrl!;const url=await resolve(uri);if(cancelled||disposed.current)return;
      let element=audio.current.get(cue.id);
      if(element&&sources.current.get(cue.id)!==uri){element.pause();element=undefined;}
      if(!element){element=new Audio(url);audio.current.set(cue.id,element);sources.current.set(cue.id,uri);}
      element.volume=cue.kind==='sound'?cue.volume:1;
      const target=Math.max(0,playback.time-cue.at);if(Math.abs(element.currentTime-target)>.4)element.currentTime=target;
      if(element.paused)await element.play();
    })().catch(e=>{if(!cancelled&&!disposed.current)setError(e instanceof Error?e.message:'No se pudo reproducir el audio.');});
    return()=>{cancelled=true;};
  },[playback,resolve]);
  const importAudio=useCallback(async(file:File,kind:StudioAudioAsset['kind'])=>{
    if(!repository.current)throw new Error('La biblioteca de audio todavía no está lista.');
    const asset=await repository.current.import(file,kind);
    if(!disposed.current){setAssets(await repository.current.list());setError(null);}
    return asset;
  },[]);
  const preview=useCallback(async(uri:string)=>{
    const url=await resolve(uri);if(disposed.current)return;
    for(const element of audio.current.values())element.pause();
    let element=audio.current.get('preview');if(!element){element=new Audio();audio.current.set('preview',element);}
    element.src=url;element.currentTime=0;await element.play();
  },[resolve]);
  return{assets,error,importAudio,preview};
}
