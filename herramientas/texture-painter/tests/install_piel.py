"""Copy the add-on source over the installed extension (same content, plus Piel)."""
from pathlib import Path
import shutil
ROOT=Path(__file__).resolve().parents[1];SOURCE=ROOT/'blender/spanstories_texture_painter'
TARGET=Path(r'C:\Users\AdrielPereira\AppData\Roaming\Blender Foundation\Blender\5.2\extensions\user_default\spanstories_texture_painter')
for path in SOURCE.rglob('*'):
    if path.is_file() and '__pycache__' not in path.parts:
        out=TARGET/path.relative_to(SOURCE);out.parent.mkdir(exist_ok=True);shutil.copy2(path,out)
print('instalado',TARGET)
