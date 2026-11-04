# Interiores con volumen para escaparates: pieles (suelo, fondo, techo) y utilería de carácter por categoría.
# Se importa desde construir_kit_escaparate.py; cada módulo registra sus piezas en kit_base.MODULOS al importarse.
import kit_interior_pieles
import kit_utileria_a
import kit_utileria_b

MODULOS_INTERIOR = (kit_interior_pieles, kit_utileria_a, kit_utileria_b)
