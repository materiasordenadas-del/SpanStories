"""Download the public resources requested in the plan. Never executes downloaded code."""
import concurrent.futures, hashlib, json, pathlib, subprocess, urllib.request
BASE = pathlib.Path(r'D:\Español\output\rachel-biblioteca-facial-20261108\fuentes')
BASE.mkdir(parents=True, exist_ok=True)
HF = 'https://huggingface.co/datasets/myned-ai/audio2face-emotion-arkit-teacher/resolve/main/'
FILES = [(HF+'README.md','audio2face/README.md'),(HF+'build_dataset.py','audio2face/build_dataset.py')]
FILES += [(HF+'data/'+name+'.parquet','audio2face/'+name+'.parquet') for name in ['train','validation','test']]
FILES += [
 ('https://codeload.github.com/OpenFaceFX/OpenFaceFX/zip/refs/heads/main','OpenFaceFX-main.zip'),
 ('https://codeload.github.com/nanlingyin/soullink-emotion-sdk/zip/refs/heads/main','soullink-emotion-sdk-main.zip'),
 ('https://raw.githubusercontent.com/jaron1990/Express4D/main/README.md','Express4D-acceso.md'),
 ('https://raw.githubusercontent.com/aigc3d/LAM_Audio2Expression/main/README.md','LAM-Audio2Expression-README.md'),
 ('https://raw.githubusercontent.com/aigc3d/LAM_Audio2Expression/main/LICENSE','LAM-Audio2Expression-LICENSE'),
 ('https://codeload.github.com/aigc3d/LAM_Audio2Expression/zip/refs/heads/main','LAM_Audio2Expression-main.zip'),
 ('https://codeload.github.com/wjc12345123/KeyframeFace/zip/refs/heads/main','KeyframeFace-main.zip'),
 ('https://raw.githubusercontent.com/wjc12345123/KeyframeFace/main/LICENSE','KeyframeFace-LICENSE'),
 ('https://raw.githubusercontent.com/wjc12345123/KeyframeFace/main/README.md','KeyframeFace-README.md')]

def get(item):
    url, name = item
    path=BASE/name;path.parent.mkdir(parents=True,exist_ok=True)
    try:
        if not path.exists():
            tmp=path.with_suffix(path.suffix+'.part')
            try:
                with urllib.request.urlopen(url,timeout=120) as response, tmp.open('wb') as out:
                    while True:
                        data=response.read(1024*1024)
                        if not data: break
                        out.write(data)
            except urllib.error.URLError as error:
                if 'CERTIFICATE_VERIFY_FAILED' not in str(error):raise
                # Use Windows' certificate store without disabling TLS verification.
                subprocess.run(['curl.exe','--fail','--location','--silent','--show-error',url,'--output',str(tmp)],check=True)
            tmp.replace(path)
        digest=hashlib.file_digest(path.open('rb'),'sha256').hexdigest()
        print(f'OK {name} {path.stat().st_size}',flush=True)
        return {'url':url,'path':str(path),'bytes':path.stat().st_size,'sha256':digest,'status':'downloaded'}
    except Exception as e:
        print(f'ERROR {name}: {e}',flush=True)
        return {'url':url,'path':str(path),'status':'failed','error':str(e)}

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    results=list(pool.map(get,FILES))
(BASE/'manifest.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
print('Completed',sum(r['status']=='downloaded' for r in results),'/',len(results),flush=True)
