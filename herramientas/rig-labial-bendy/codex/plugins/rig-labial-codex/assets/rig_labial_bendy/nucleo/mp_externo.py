# Se ejecuta FUERA de Blender, con un Python que tenga mediapipe (0.8.50). No importa bpy ni nada del add-on.
#   python mp_externo.py entrada.json salida.json
# entrada: {"imagenes": {"nombre": "ruta.png", ...}}. salida: {"nombre": {"puntos": [[x, y], ...] en píxeles} o {"error": "..."}}.
# Devuelve solo los puntos de FaceMesh que el add-on contrasta con la geometría, no la malla entera.
import json
import sys

PUNTOS = {'lagrimal.L': 362, 'rabillo.L': 263, 'parpado_sup.L': 386, 'parpado_inf.L': 374,
          'lagrimal.R': 133, 'rabillo.R': 33, 'parpado_sup.R': 159, 'parpado_inf.R': 145,
          'comisura.L': 291, 'comisura.R': 61, 'labio_sup': 13, 'labio_inf': 14, 'nariz': 1, 'menton': 152,
          'iris.L': 473, 'iris.R': 468}


def analizar(ruta, mp, cv2):
    img = cv2.imread(ruta)
    if img is None:
        return {'error': 'no se pudo leer la imagen'}
    h, w = img.shape[:2]
    with mp.solutions.face_mesh.FaceMesh(static_image_mode=True, max_num_faces=1, refine_landmarks=True, min_detection_confidence=0.2) as fm:
        r = fm.process(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
    if not r.multi_face_landmarks:
        return {'error': 'sin cara'}
    lm = r.multi_face_landmarks[0].landmark
    return {'puntos': {k: [lm[i].x * w, lm[i].y * h] for k, i in PUNTOS.items()}}


def main():
    entrada = json.load(open(sys.argv[1], encoding='utf8'))
    import cv2
    import mediapipe as mp
    salida = {n: analizar(r, mp, cv2) for n, r in entrada['imagenes'].items()}
    json.dump(salida, open(sys.argv[2], 'w', encoding='utf8'))


if __name__ == '__main__':
    main()
