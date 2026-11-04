"use client";

import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Connection, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { sequenceDuration, sequenceList, type StudioProject, type StudioSource } from '@/features/story-studio/model';
import styles from './story-studio.module.css';
import {useState} from 'react';

type BeatNode = Node<{ title: string; text: string; kind: string; options: { id: string; label: string }[]; active: boolean }, 'beat'>;
const gateNames = { auto: 'Al terminar', continue: 'Esperar al estudiante', choice: 'Elegir un camino', answer: 'Responder', object: 'Tocar un objeto' };
function Beat({ data }: NodeProps<BeatNode>) {
  return <div className={`${styles.flowNode} ${data.active ? styles.activeNode : ''}`} data-kind={data.kind}>
    <Handle type="target" position={Position.Left} />
    <div className={styles.nodeTitle}><span>{data.kind === 'gate' ? '◇' : '▤'}</span>{data.title}</div>
    <p>{data.text}</p>
    {data.options.length ? data.options.map((o, i) => <div key={o.id} className={styles.nodeOption}>{o.label}<Handle id={o.id} type="source" position={Position.Right} style={{ top: `${70 + i * 28}px` }} /></div>) : <Handle type="source" position={Position.Right} />}
  </div>;
}
const nodeTypes = { beat: Beat };

export function StudioFlow({ project, source, sceneId, selectedId, selectedCueId, detail=false, onSelect, onCueSelect, onChange }: {
  project: StudioProject; source: StudioSource; sceneId: string; selectedId: string;
  selectedCueId?:string|null;detail?:boolean;onSelect: (id: string,gate?:boolean) => void;onCueSelect?:(id:string)=>void; onChange: (project: StudioProject) => void;
}) {
  const scene = project.scenes.find(s => s.id === sceneId)!;
  const [dragPositions,setDragPositions]=useState<Record<string,{x:number;y:number}>>({});
  const all = sequenceList(project);
  const nodes: BeatNode[] = [];
  const edges: { id: string; source: string; target: string; sourceHandle?: string; label?: string; type: string; markerEnd: { type: MarkerType }; style: { stroke: string } }[] = [];
  const edge = (id: string, sourceId: string, target: string, label?: string, sourceHandle?: string) => edges.push({ id, source: sourceId, target, label, sourceHandle, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#7894ae' } });
  scene.sequences.forEach((sequence, i) => {
    const dialogue = sequence.cues.find(c => c.kind === 'dialogue');
    const text = dialogue?.kind === 'dialogue' ? source.sentences.find(s => s.id === dialogue.sentenceId)?.text ?? '' : `${sequence.cues.length} acciones · ${sequenceDuration(sequence).toFixed(1)} s`;
    const position = project.nodeLayout?.[sequence.id] ?? { x: i * 270, y: i % 2 ? 170 : 30 };
    nodes.push({ id: sequence.id, type: 'beat', position, selected: sequence.id === selectedId, data: { title: sequence.name, text, kind: 'sequence', options: [], active: sequence.id === selectedId } });
    const gateId = `${sequence.id}:gate`, gate = sequence.gate;
    const next = gate.nextSequenceId ?? all[all.findIndex(x => x.sequence.id === sequence.id) + 1]?.sequence.id;
    if (gate.kind !== 'auto') {
      nodes.push({ id: gateId, type: 'beat', position: project.nodeLayout?.[gateId] ?? { x: position.x, y: position.y + 145 }, data: { title: gateNames[gate.kind], text: gate.prompt, kind: 'gate', options: gate.kind === 'choice' ? gate.options : [], active: sequence.id === selectedId } });
      edge(`${sequence.id}:wait`, sequence.id, gateId);
      if (gate.kind === 'choice') gate.options.forEach(o => { if (o.nextSequenceId ?? next) edge(`${gateId}:${o.id}`, gateId, (o.nextSequenceId ?? next)!, o.label, o.id); });
      else if (next) edge(`${gateId}:next`, gateId, next, 'Resuelto');
    } else if (next) edge(`${sequence.id}:next`, sequence.id, next, 'Al terminar');
  });
  if(detail){
    nodes.length=0;edges.length=0;
    const sequence=scene.sequences.find(s=>s.id===selectedId)??scene.sequences[0];
    const cues=[...sequence.cues].sort((a,b)=>a.at-b.at),lanes=['camera','actor','dialogue','sound'];
    nodes.push({id:'start',type:'beat',position:{x:0,y:115},data:{title:'Inicio del momento',text:sequence.name,kind:'start',options:[],active:false}});
    for(const cue of cues){
      const text=cue.kind==='dialogue'?source.sentences.find(s=>s.id===cue.sentenceId)?.text??'':cue.kind==='actor'?`${scene.actors.find(a=>a.id===cue.actorId)?.name} · ${cue.action}`:cue.kind==='camera'?cue.label:cue.label;
      nodes.push({id:cue.id,type:'beat',position:project.nodeLayout?.[cue.id]??{x:240+cue.at*110,y:lanes.indexOf(cue.kind)*130},data:{title:`${{camera:'Cámara',actor:'Actuación',dialogue:'Diálogo',sound:'Sonido'}[cue.kind]} · ${cue.at.toFixed(1)}s`,text,kind:cue.kind,options:[],active:cue.id===selectedCueId}});
      const prior=cues.filter(c=>c.id!==cue.id&&c.at+c.duration<=cue.at).sort((a,b)=>(b.at+b.duration)-(a.at+a.duration))[0];
      edge(`${cue.id}:in`,prior?.id??'start',cue.id,prior?'Después':'Al iniciar');
    }
    const gate=sequence.gate,gateId=`${sequence.id}:gate`,end=sequenceDuration(sequence);
    nodes.push({id:gateId,type:'beat',position:project.nodeLayout?.[gateId]??{x:500+end*110,y:115},data:{title:gateNames[gate.kind],text:gate.kind==='auto'?'Pasar al siguiente momento':gate.prompt,kind:'gate',options:gate.kind==='choice'?gate.options:[],active:false}});
    const ends=cues.filter(c=>c.at+c.duration===end);
    if(!cues.length)edge('empty','start',gateId);
    ends.forEach(c=>edge(`${c.id}:end`,c.id,gateId,'Al terminar'));
  }
  const connect = (connection: Connection) => {
    if(detail){
      const copy=structuredClone(project),sequence=sequenceList(copy).find(x=>x.sequence.id===selectedId)!.sequence;
      const from=sequence.cues.find(c=>c.id===connection.source),to=sequence.cues.find(c=>c.id===connection.target);
      if(to&&from&&from.id!==to.id){to.at=from.at+from.duration;onChange(copy);}
      return;
    }
    if (!connection.source || !connection.target || connection.target.endsWith(':gate')) return;
    const id = connection.source.replace(/:gate$/, ''), copy = structuredClone(project);
    const sequence = sequenceList(copy).find(x => x.sequence.id === id)?.sequence;
    if (!sequence || id === connection.target) return;
    if (sequence.gate.kind === 'choice' && connection.sourceHandle) {
      const option = sequence.gate.options.find(o => o.id === connection.sourceHandle); if (option) option.nextSequenceId = connection.target;
    } else sequence.gate.nextSequenceId = connection.target;
    onChange(copy);
  };
  return <ReactFlow<BeatNode> key={`${sceneId}:${detail?selectedId:'overview'}`} nodes={nodes.map(node=>dragPositions[node.id]?{...node,position:dragPositions[node.id]}:node)} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: .15 }} minZoom={.25} maxZoom={1.4} colorMode="dark"
    deleteKeyCode={null} onConnect={connect} nodesConnectable onNodeClick={(_, node) => {if(detail&&!node.id.endsWith(':gate')){if(node.id!=='start')onCueSelect?.(node.id);}else onSelect(node.id.replace(/:gate$/, ''),node.id.endsWith(':gate'));}}
    onNodesChange={changes=>{const moving=changes.filter(change=>change.type==='position'&&change.dragging&&change.position);if(moving.length)setDragPositions(previous=>{const next={...previous};for(const change of moving)if(change.type==='position'&&change.position)next[change.id]=change.position;return next;});}}
    onNodeDragStop={(_, node) => {setDragPositions({});onChange({ ...project, nodeLayout: { ...project.nodeLayout, [node.id]: node.position } });}}>
    <Background color="#2b4255" gap={18} size={1} /><Controls showInteractive={false} />
  </ReactFlow>;
}
