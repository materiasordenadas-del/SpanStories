# Corrección localizada para deformación

Estos son criterios de revisión visual, no reglas rígidas de cantidad de bucles.
Añade densidad donde el movimiento demuestra que falta y mueve polos fuera de la
máxima compresión/torsión. Conserva la silueta y transiciones de densidad suaves.

| Zona | Revisar/corregir | Prueba que decide |
| --- | --- | --- |
| Hombro y axila | Flujo entre pecho, espalda, deltoides y brazo; espacio de compresión en axila. Reparto clavícula/húmero, centro de rotación. | Brazo arriba y adelante; observar axila y caída del deltoides. |
| Codo | Banda central y bucles a ambos lados de la bisagra; soporte exterior del olécranon y espacio interior de compresión. | 90° y flexión profunda; perfil, sin hundimiento ni aristas duras. |
| Antebrazo/muñeca | Bucles que distribuyan torsión, transición suave hacia mano; radio de giro y pesos. | Pronación/supinación y flexión de mano; twist si el giro se concentra. |
| Cadera e ingle | Flujo de pelvis hacia muslo/glúteo; compresión inguinal, sin estrellas en el pliegue. | Sentadilla y pierna arriba/afuera; vista frontal y lateral. |
| Rodilla | Soporte de rótula, bandas a ambos lados y espacio de compresión posterior. | 90° y flexión profunda; rótula y hueco posterior. |
| Tobillo | Transición pierna-talón/empeine y apoyo del pie; pivotes del rig. | Dorsiflexión, extensión y apoyo; observar talón/empeine. |
| Cuello | Anillos que repartan giro hacia torso/cabeza; evitar contaminación de mandíbula/hombro. | Rotación e inclinación; silueta lateral y base del cuello. |

Triángulos y polos fuera de máxima deformación pueden funcionar; un quad largo
mal orientado puede deformar peor. No traslades un polo a la axila o detrás de la
rodilla solo por estar oculto: son zonas de compresión y deben probarse.

Después de un parche, compara contorno en vistas frontal/lateral y, si procede,
distancia al original. Transfiere y verifica UV/pesos/shape keys afectados. Para
pesos, inspecciona la mezcla de huesos vecinos y su gradiente; nunca normalices
grupos de máscaras/ropa como si fueran huesos deformantes. Armature Preserve Volume
puede mejorar torsión pero también crear abultamientos; compara ambas opciones
solo si el destino soporta el método. Un volumen global correcto puede ocultar
un codo colapsado: la inspección debe ser local.
