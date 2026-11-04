# API local 0.5.2

En Blender, si la extensión está instalada y su versión se verificó:
```python
import bpy
from bl_ext.user_default.rig_labial_bendy.nucleo import pasos
cara = bpy.data.objects['NOMBRE_CONFIRMADO']
result = pasos.analizar(cara)
```
Si no está instalada, puede importarse la copia incluida añadiendo `assets` a `sys.path` en un proceso aislado de Blender autorizado. No sobreescribas una instalación activa ni recargues módulos de otra sesión.

API inspeccionada en `assets/rig_labial_bendy/nucleo/pasos.py`:

| Función | Efecto relevante |
|---|---|
| analizar(cara) | Diagnóstico de malla |
| inventariar_uv(cara, tolerance=1e-6) | Solo lectura: caras agrupadas por arista geométrica compartida y UV continuos en ambos extremos |
| marcar_regiones_uv(cara, asignaciones, ojos_uv_seeds, tolerance=1e-6) | Resuelve semillas de isla UV a caras, valida y persiste colores más traza UV |
| ocultar_ojos_uv(cara, semillas, tolerance=1e-6) | Crea una ocultación reversible Geometry Nodes desde semillas UV; no aplica ni reindexa la malla |
| restaurar_ojos_uv(cara) | Retira el modificador reversible y sus atributos `RLB_ocultar_ojos_uv` / `RLB_indice_base` |
| sincronizar_pestanas_uv(cara, rig, keys=None) | Proyecta pestañas `RLB_region_id=2` a aristas raíz de la mayor isla UV de piel adyacente; interpola pesos DEF-parp_* y cabeza y propaga correctivas de contacto |
| inventariar_islas(cara) | Solo lectura: componentes conectados, semillas, límites, vértices y material indices |
| marcar_regiones(cara, regiones, ojos) | Persiste face IDs y colores CORNER desde face indices suministrados; requiere índices oculares para excluirlos; no autodetecta ni modifica UV/material/topología |
| mostrar_regiones(cara, visible=True) | Muestra el atributo de color en viewport o vuelve a mostrar materiales |
| detectar_boca(cara, cursor=None) | Coloca solo comisura L/R y centro de labio superior/inferior; deja aprobación pendiente |
| aprobar_marcadores(cara) | Firma coordenadas actuales de los cuatro marcadores tras revisión del usuario |
| detectar(cara, cursor=None) | Marcadores, clasificación y foto |
| simetrizar(cara) | Copia marcadores L a R |
| arreglar(cara, cuant=True, solapas=True, normales=True, dientes=True, separar_cejas=False, rendija=True) | Cambia malla, keys y piezas; no es exclusivo de labios |
| rig_labios(cara, pinch_follow=0.1, chew=0.75) | Huesos de labios |
| pesos(cara) | Pesos y correctivas de labio |
| boca_interior(cara, ajustes=None) | Dientes, lengua y fondo |
| ojos_vale / ojos_existentes | Sustitución o conexión ocular |
| parpados(cara, parametros=None) | Sistema ocular con posibles efectos en cejas/mejillas |
| crear_gestos(cara) | Assets y acción de gestos |
| revisar(cara, poses=None, vistas=None, color='TEXTURE') | Hojas visuales |
| revisar_ojos(cara, lado='L', poses=None, vistas=None) | Revisión ocular por lado |
| comprobar_parpados(cara) | Medición por rayos |
| medir_contacto(cara) | Separación/cruce 3D |
| medir_cierre / medir_oclusion | Penetración, rendija y oclusión |
| contacto_parpados(cara, parametros=None) | Reconstrucción de correctiva de contacto |

`analizar` incluye primero islas UV: las caras se conectan solo al compartir arista geométrica y UV continuos en ambos extremos dentro de tolerancia. Las costuras UV permanecen separadas y UV coincidentes en aristas distintas no se fusionan. Sigue disponible el inventario por vértices y superficies; `shared_vertices` reporta contactos por vértice entre superficies. `rig_labios` bloquea la construcción si la detección semiautomática sigue pendiente o si los puntos cambiaron desde la aprobación; tras moverlos, una nueva aprobación firma la posición actual. Las sesiones antiguas sin estado semiautomático conservan el comportamiento previo. `transform_ok` no demuestra que la geometría esté centrada en X=0: revisa el eje facial real antes de aceptar simetría. La detección heredada propone puntos y no garantiza precisión. No asumas que renderizar o medir restaura todo el estado: comprueba frame, acción y pose antes/después. Los números históricos en la referencia Claude no constituyen validación de 0.5.2.

La sincronización de pestañas no divide ni modifica la malla base: deriva aristas raíz de adyacencia geométrica entre las caras UV aprobadas de pestaña y la isla de piel vecina de mayor tamaño. Conserva los pesos en vértices raíz, interpola solo `DEF-parp_*` y `cabeza` en los vértices de pestaña restantes y propaga el delta de `parp_contacto.*` conservando el offset geométrico de cada pestaña. La ocultación ocular usa un atributo FACE y Geometry Nodes no aplicado; la evaluación de contacto remapea por `RLB_indice_base` y falla explícitamente si falta el mapa y los conteos difieren.

La clasificación de regiones es explícita: pasa índices de caras revisados a `marcar_regiones`, incluidos los ojos para excluirlos del color. El mapa registra IDs y colores; no hace detección semántica automática. Los ojos permanecen grises. El mapa violeta previo incluía piel del párpado por proximidad y no certifica pestañas. La identificación final de ojos y márgenes oculares/rim todavía está pendiente.

Cuando `pasos.parpados` encuentra una traza UV con región `pestanas` y caras `RLB_region_id=2`, fuerza `recortar_globo=False`: la máscara UV aprobada evita el recorte geométrico heredado. Sin esa evidencia conserva el parámetro/default legado. BlenRig y EasyWeight se consultaron como referencias de auditoría (huesos de borde sin suavizado correctivo en el borde; revisión por islas y normalización de grupos deformantes). Son ideas, no código incorporado; no se copió código GPL.

En modo de huesos y con pestañas UV aprobadas, `ojos.parpados` sincroniza sus pesos con las raíces UV después de construir los huesos y antes de crear contacto. El acople por interpolación de islas queda reservado al flujo heredado sin mapa UV; así no sobrescribe la transferencia radial posterior. Al cerrar con `recortar_globo=False`, no escala el pivote ocular.
