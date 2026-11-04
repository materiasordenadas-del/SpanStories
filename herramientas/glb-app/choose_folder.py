"""Selector nativo independiente del servidor local."""
import json, sys
import tkinter as tk
from tkinter import filedialog

root = tk.Tk()
root.withdraw()
root.attributes('-topmost', True)
try:
    if '--save' in sys.argv:
        folder = filedialog.asksaveasfilename(parent=root, title='Guardar GLB como',
                                              initialdir=sys.argv[1] or None,
                                              initialfile=sys.argv[-1], defaultextension='.glb',
                                              filetypes=[('Modelo GLB', '*.glb')])
    else:
        folder = filedialog.askdirectory(parent=root, title='Carpeta predeterminada para los GLB',
                                         initialdir=sys.argv[1] or None, mustexist=True)
    sys.stdout.buffer.write(json.dumps(folder, ensure_ascii=False).encode('utf-8'))
finally:
    root.destroy()
