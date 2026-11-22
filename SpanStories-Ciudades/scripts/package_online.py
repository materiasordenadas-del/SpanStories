"""Package the verified static runtime, never sources or reports from the workspace."""
import json
from pathlib import Path
import zipfile

project=Path(__file__).resolve().parent.parent
root=project/'dist-online'
assert root.resolve().is_relative_to(project.resolve())
assert json.loads((root/'package-info.json').read_text(encoding='utf8'))['id']=='spanstories-online-build'
output=project/'SpanStories-online.zip'
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
    for file in root.rglob('*'):
        if file.is_file():archive.write(file,file.relative_to(root).as_posix())
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    names=archive.namelist()
    assert all(name in names for name in ['index.html','engine/CityTransport.js','engine/CityRoomClient.js','engine/CityMultiplayer.js','engine/CityRemoteTrack.js','engine/CityResolution.js','serve.py','ONLINE.md'])
    assert not any(name.endswith(('.blend','.blend1','.raw.glb','.dedup.glb')) for name in names)
print(json.dumps({'zip':str(output),'bytes':output.stat().st_size,'entries':len(names),'verified':True},ensure_ascii=False))
