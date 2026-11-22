"""Pin the viewer's already-used public dependencies locally, retaining licenses."""
import io, pathlib, re, tarfile, urllib.request
HERE=pathlib.Path(__file__).resolve().parent
data=urllib.request.urlopen('https://registry.npmjs.org/three/-/three-0.170.0.tgz',timeout=45).read()
with tarfile.open(fileobj=io.BytesIO(data),mode='r:gz') as archive:
    todo=['build/three.module.js','examples/jsm/loaders/GLTFLoader.js','examples/jsm/controls/OrbitControls.js','examples/jsm/environments/RoomEnvironment.js','LICENSE']
    done=set()
    while todo:
        name=todo.pop()
        if name in done:continue
        done.add(name)
        member=archive.getmember('package/'+name);raw=archive.extractfile(member).read()
        out=HERE/'vendor/three'/name;out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(raw)
        if name.endswith('.js'):
            for rel in re.findall(r'''(?:from\s*|import\s*\()\s*['"](\.[^'"]+)['"]''',raw.decode()):
                target=(pathlib.PurePosixPath(name).parent/rel)
                parts=[]
                for part in target.parts:
                    if part=='..':parts.pop()
                    elif part!='.':parts.append(part)
                dependency='/'.join(parts)
                if dependency.endswith('.js'):todo.append(dependency)
rapier=HERE/'vendor/rapier';rapier.mkdir(parents=True,exist_ok=True)
for remote,local in [('rapier.es.js','rapier.es.js'),('LICENSE','LICENSE')]:
    try:(rapier/local).write_bytes(urllib.request.urlopen('https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.14.0/'+remote,timeout=45).read())
    except Exception as e:print(local,str(e))
print('Three files:',len(done),'Rapier bytes:',(rapier/'rapier.es.js').stat().st_size)
