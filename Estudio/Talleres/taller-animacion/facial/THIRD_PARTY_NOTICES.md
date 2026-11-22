# Código de terceros

`vendor/mediapipe/` contiene MediaPipe Tasks Vision `0.10.22-rc.20250304` de Google (Apache 2.0, licencia incluida) y el modelo oficial Face Landmarker float16 versión 1. Procedencia y uso local en `vendor/mediapipe/README.md`.

`FacialCurveView.mjs` adapta la acumulación de límites del editor de curvas de Ekza Studio, archivo `packages/curve-editor/src/graph/frame.ts`, procedente del ZIP local `ekza-studio-main.zip`.

Copyright (c) 2026 Ekza Studio contributors. Licencia MIT íntegra en `licenses/ekza-studio-main-MIT.txt`.

Se reutiliza únicamente el cálculo de límites. El editor original, su pista facial, su formato y sus curvas de reproducción se conservan. El gráfico incorpora selección de claves y ajuste visual para expresiones de poca amplitud.
