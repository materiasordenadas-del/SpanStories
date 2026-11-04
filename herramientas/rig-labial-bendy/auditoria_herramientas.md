# Auditoría de herramientas: lip sync y pickers

Fecha: 2026-10-18. Solo lectura. No se instaló nada ni se extrajo ningún archivo. Las cabeceras y listados se leyeron con `zipfile` dentro del Python de Blender (`-I`).

## 1. Pickers de rig (`D:\Español\imagen para animación\Animation app\Facial rig\`)

Formato: todos son **ZIP** (cabecera `PK`) con `manifest.json` (JSON UTF-8), `metadata.json` y fondos/miniaturas. El `.basset` es un ZIP con `asset.json`, un `payload/*.blend` y un `companion/*.bpicker`.

- **Elle Picker.bpicker** (14,3 MB): rig "Elle". Pestañas Ellie_body (229 botones) y Body (280). Controles CT_eye, CT_upperLip, CT_lowerLip, CT_teethUp/Down, L_eyelid_01..08, L_eyebrow_01..03, L_highCheek, L_sideLip, tongue_1..3.
- **auto-rig-pro-picker.bpicker** (0,76 MB): Auto-Rig Pro. Pestaña "ARP Body" (189). Botones tongue, teeth.T/B, chin, EYE AIM, c_neck.x.
- **storm-rig-picker.bpicker** (20,7 MB): rig "Storm". Cuatro pestañas (209, 1, 5, 201 botones). Expresiones como botones: Angry, Annoyed, Concerned, Scared, Skeptical, Smirk, Smile 01; Head, Eye Aim.
- **igbo-princess-rig-01.basset** (209 MB; payload 339 MB sin comprimir): rig biped "Igbo Princess" (autor Munorr, licencia "standard"). Trae el blend completo y su picker companion (30 MB, 326 botones).

Add-on que los usa: no identificado. Ningún `.py` de `Animation app` ni de `%APPDATA%\Blender Foundation\Blender\5.2` menciona `bpicker`. Los scripts de botón usan `bpy.data.objects[@ns].pose.bones[...]` (`@ns` = namespace), o sea, controles por hueso. Cada botón guarda posición, color, `assigned_objects`, `mode` (select/pose/script) y `script_data`.

Conclusión: **no sirven como plantilla de picker para Lian**. Son rigs de hueso. Ningún archivo referencia shape keys ni nombres ARKit (cero coincidencias de `key_blocks`, `shape_key`, `ARKit`, `viseme`, `jawOpen`). Sí son útiles como referencia de **nombres y agrupación** de controles de boca (teeth_up/down, tongue_1..3, lowCheek, sideLip). El `.basset` (209 MB) no aporta nada para Lian.

## 2. Add-on Lip Sync (cgpoly) v2.3.2

Ubicación real: `D:\Español\imagen para animación\Pruebas de Rig\add-on-iocgpoly-lip-sync-v2.3.2-windows-x64.zip` (37,5 MB, 95 entradas). No estaba en Downloads ni en Desktop. Licencia: GPL-3.0-or-later (add-on, phonemizer, eSpeak NG); Vosk, Apache-2.0. Declara Blender 4.4+.

Pipeline (leído en `Operators/LIPSYNC2D_OT_AnalyzeAudio.py` y `Core/LIPSYNC2D_DialogInspector.py`):
1. Mezcla el strip de sonido del VSE a WAV mono 16 kHz.
2. **Vosk** reconoce palabras con `start`/`end`. Usa lo que reconoce, no el texto del usuario. El modelo se descarga de alphacephei en el primer uso (~40 MB según README); no viene en el zip.
3. **phonemizer + espeak** convierte cada palabra a IPA. Para `es` usa espeak `es` (castellano: c/z = θ).
4. Tabla `phoneme_to_viseme_arkit_v2`: IPA → 15 visemas tipo MPEG-4 (sil, PP, FF, TH, DD, kk, CH, SS, nn, RR, aa, E, ih, oh, ou) más UNK.
5. Tiempos: dentro de cada palabra, los visemas se reparten a **intervalos iguales**. No hay alineación fonémica real.
6. Keyframes en `key_blocks["<nombre>"].value`. El nombre lo elige el usuario por visema. Valor 1 en su visema y 0 en el resto. **Interpolación LINEAR** en todos los keyframes. Hay también animadores por pose y por spritesheet.

Español: sí. El zip trae `espeak-ng-data` con `es` y `es-419`. Fallos verificados en el código:
- Bug de multi-carácter: `get_visemes` recorre el IPA **carácter a carácter**, así que las claves de dos símbolos (`tʃ`, `dʒ`, `aɪ`, `eː`, `ɑ̃`) nunca coinciden. El "ch" español sale como DD+SS, no CH.
- Sin mapeo: β y ʎ caen en UNK. Discutibles: ɣ, x y j → DD; ð y θ → TH.
- Usa `es` (castellano), no `es-419` (latinoamericano).

Uso fuera de Blender: el add-on no es llamable como librería (importa `bpy` y necesita un strip de sonido en el VSE). Sí se puede reutilizar la lógica con: `vosk` (wheel `vosk-0.3.41-py3-none-win_amd64.whl`, trae libvosk.dll), `phonemizer-3.3.0`, `libespeak-ng.dll` (479 KB, en `Assets/Archives/windows/espeak-ng-windows.zip`) y `espeak-ng-data`. Vosk acepta gramática JSON (`KaldiRecognizer(model, rate, json)`, verificado en el wheel): si el guion ya se conoce (Gemini TTS), limitar el reconocimiento a esas palabras debería mejorar los tiempos. Hay que probarlo.

Riesgo de versión: los wheels binarios de Windows son **cp311** (`cffi`, `regex`, `rpds_py`). Blender 5.2 trae **Python 3.13.13** (verificado). Probablemente no cargue en 5.2. Probar en un .blend desechable antes de depender de él.

## 3. Audio y transcripciones en disco

- No hay ningún .wav/.mp3/.ogg/.flac/.m4a/.aac en `D:\Español\imagen para animación`, ni a 3 ni a 6 niveles. Solo hay vídeos `gemini_generated_video_*.mp4` en `Rostros\`. Ningún TTS de Gemini guardado, tampoco en Downloads.
- No hay transcripciones de tutoriales de lip sync (.txt/.srt/.md/.vtt con lip, sync o visema). Las coincidencias eran documentos propios de `rig_labial_bendy` (por la palabra "labial" en la ruta).

## 4. Herramientas y voces instaladas

- `where espeak / espeak-ng / rhubarb / mfa / ffmpeg / sox`: ninguna está en PATH.
- Python de Blender 5.2 (3.13.13): numpy sí; vosk, phonemizer, librosa, soundfile, pydub no.
- Python 3.12 del sistema: numpy sí; vosk, phonemizer y espeak-ng no.
- Voces SAPI: Microsoft Helena (es-ES), Zira y David (en-US). Solo una voz española, castellana.
- Disco: D: 33 GB libres; C: 2,3 GB libres. La nota de memoria "≈50 MB libres" está desfasada.

## 5. MFA y Rhubarb (de memoria, sin instalar)

- **MFA**: alineación forzada texto+WAV, tiempos fonémicos precisos. Es lo mejor si el texto es conocido, pero exige conda + Kaldi (más de 1 GB) y un modelo acústico español. Con 2,3 GB libres en C: no es práctico.
- **Rhubarb**: binario pequeño, salida A–H/X (Preston Blair) con tiempos. Su reconocedor es para inglés; en español va en modo fonético y con menos precisión. Sirve como segunda opinión, no como fuente principal.

## 6. Qué reutilizar

Reutilizar:
- La tabla de visemas corregida, con el patrón Vosk (gramática del guion) → phonemizer `es-419` → reparto por visema. Salida a nombres ARKit: jawOpen, mouthClose, mouthFunnel, mouthPucker, mouthSmileLeft/Right, mouthRollLower, tongueOut.
- El método de keyframes LINEAR por nombre de shape key, escrito por nosotros para no depender de la UI del add-on.

No reutilizar:
- Los `.bpicker`/`.basset` para el rig de shape keys (son de hueso). Solo como referencia de nombres.
- El add-on tal cual en Blender 5.2 (cp311, sin verificar) ni su animador (15 visemas, un solo shape key activo a la vez).
- MFA y Rhubarb, por ahora.

Nada instalado, nada extraído ni modificado salvo este informe.
