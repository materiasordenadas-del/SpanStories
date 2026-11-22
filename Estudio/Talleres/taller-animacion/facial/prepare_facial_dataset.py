"""Prepare downloaded ARKit teacher data offline; browser loads only selected JSON clips."""
import collections, hashlib, json, math, pathlib, sys
HERE=pathlib.Path(__file__).resolve().parent
DELIVERY=pathlib.Path(r'D:\Español\output\rachel-biblioteca-facial-20261108')
sys.path.insert(0,str(DELIVERY/'herramientas-python'))
import pyarrow.parquet as pq

SOURCE=DELIVERY/'fuentes/audio2face'
OUT=HERE/'facial-data';OUT.mkdir(exist_ok=True)
CHANNELS=sorted(json.loads((HERE/'rachel.json').read_text(encoding='utf-8'))['morphs']['arkit'])
EMOTIONS={'angry':('Enojo','Enfado'),'happy':('Alegría','Alegría'),'sad':('Tristeza','Tristeza'),'fear':('Miedo','Temor'),'disgust':('Desagrado','Desagrado'),'neutral':('Neutral','Neutral'),'surprise':('Sorpresa','Sorpresa'),'calm':('Calma','Calma'),'apologetic':('Interacción','Disculpa'),'assertive':('Interacción','Afirmación'),'concerned':('Preocupación','Preocupación'),'encouraging':('Interacción','Ánimo')}
INTENSITY={'low':'suave','normal':'normal','high':'intensa','unspecified':'natural'}
LICENSES={'cremad':'ODbL-1.0','tess':'CC-BY-4.0','jl_corpus':'CC-BY-4.0','ravdess':'CC-BY-NC-SA-4.0'}

def simplify(keys,tolerance=.001):
    keep={0,len(keys)-1};stack=[(0,len(keys)-1)]
    while stack:
        a,b=stack.pop()
        if b-a<2:continue
        ta,va=keys[a];tb,vb=keys[b];worst=0;index=None
        for k in range(a+1,b):
            t,v=keys[k];err=abs(v-(va+(vb-va)*(t-ta)/(tb-ta)))
            if err>worst:worst=err;index=k
        if worst>tolerance:keep.add(index);stack.extend([(a,index),(index,b)])
    return [keys[k] for k in sorted(keep)]

index=[];counts=collections.Counter();invalid=[];clamped=0;total_bytes=0;seen=set()
for split in ['train','validation','test']:
    parquet=pq.ParquetFile(SOURCE/(split+'.parquet'))
    columns=['clip_id','source','emotion_label','emotion_label_native','intensity','num_frames','actor_id','nim_bs']
    for batch in parquet.iter_batches(batch_size=64,columns=columns):
        for row in batch.to_pylist():
            frames=row.pop('nim_bs');key=f"{row['source']}:{row['clip_id']}"
            if key in seen:raise ValueError('Duplicate source clip: '+key)
            seen.add(key)
            if len(frames)!=row['num_frames'] or len(frames)<2 or any(len(f)!=52 or any(not math.isfinite(v) for v in f) for f in frames):invalid.append(key);continue
            digest=hashlib.sha256(key.encode()).hexdigest()[:20];clip_id='a2f.'+digest
            duration=round(.15+(len(frames)-1)/30+.2,6)
            channels={}
            for channel,n in enumerate(CHANNELS):
                keys=[[0,0]]
                for f,values in enumerate(frames):
                    raw=values[channel];v=max(0,min(1,raw));clamped+=v!=raw
                    keys.append([round(.15+f/30,6),round(v,4)])
                keys.append([duration,0]);channels[n]=simplify(keys)
            category,label=EMOTIONS.get(row['emotion_label'],('Otras',row['emotion_label']))
            name=f"{label} · {INTENSITY.get(row['intensity'],row['intensity'])} · {row['clip_id']}"
            tags=[row['emotion_label'],row['emotion_label_native'],row['source'],'audio2face','habla','sintético']
            source={'kind':'imported','license':'Apache-2.0','url':'https://huggingface.co/datasets/myned-ai/audio2face-emotion-arkit-teacher','dataset':'myned-ai/audio2face-emotion-arkit-teacher','sourceCorpus':row['source'],'sourceCorpusLicense':LICENSES[row['source']],'clipId':row['clip_id'],'split':split,'teacher':'NVIDIA Audio2Face-3D-v2.3.1-James','sourceColumn':'nim_bs','channelOrder':'alphabetical ARKit-52 as declared by dataset card','redistribution':'review-required; source corpus and model terms must be assessed','adaptation':'0.15s neutral lead-in, 0.20s neutral recovery; linear simplification error <=0.001 plus rounding <=0.00005'}
            preset={'schema':'spanstories.facial-animation','version':1,'id':clip_id,'name':name,'category':category,'tags':tags,'type':'animation','fpsReference':30,'timeUnit':'seconds','duration':duration,'loop':False,'rig':'ARKit-52','interpolation':'linear','channels':channels,'source':source,'review':{'status':'unreviewed','note':'Synthetic emotional speech; not a human-captured gesture. Check on Rachel before use.'}}
            filename=digest+'.json';payload=json.dumps(preset,ensure_ascii=False,separators=(',',':')).encode('utf-8');(OUT/filename).write_bytes(payload);total_bytes+=len(payload)
            index.append({k:preset[k] for k in ['id','name','category','tags','duration']}|{'source':{'kind':'imported','license':source['license'],'sourceCorpus':source['sourceCorpus'],'sourceCorpusLicense':source['sourceCorpusLicense']},'file':filename,'bytes':len(payload),'sha256':hashlib.sha256(payload).hexdigest()})
            counts[category]+=1
            if len(index)%1000==0:print('Prepared',len(index),'clips',flush=True)
catalog={'schema':'spanstories.facial-catalog','version':1,'count':len(index),'channels':CHANNELS,'clips':index}
(OUT/'index.json').write_text(json.dumps(catalog,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
report={'converted':len(index),'categories':dict(counts),'invalid':invalid,'clampedValues':clamped,'jsonBytes':total_bytes,'rawBytes':sum(p.stat().st_size for p in SOURCE.glob('*.parquet')),'modelAndSourceRestrictions':'Local evaluation only until reviewed; no publication performed.'}
(DELIVERY/'conversion-dataset.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=True),flush=True)
