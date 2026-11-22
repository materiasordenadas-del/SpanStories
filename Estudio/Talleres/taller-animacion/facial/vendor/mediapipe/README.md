# MediaPipe Face Landmarker (local)

SDK fijado: `@mediapipe/tasks-vision@0.10.22-rc.20250304`, distribuido en npm/jsDelivr. `vision_bundle.mjs` y `wasm/*` proceden de ese mismo paquete. Licencia Apache 2.0 en LICENSE; los archivos conservan sus avisos.

Modelo oficial versión 1 (float16): https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task

Documentación: https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js

El SDK, WASM y modelo se sirven desde el Taller. No se descarga código ni se envía vídeo a servicios externos durante la captura. Inferencia en worker con CPU, máximo 25 fotogramas por segundo; una sola inferencia pendiente. No se captura audio. Las grabaciones solo contienen curvas faciales y se descargan por acción del usuario.
