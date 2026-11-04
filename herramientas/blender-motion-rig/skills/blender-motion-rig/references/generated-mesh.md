# Mallas generadas: forma de topología antes de pesos

Una superficie de Tripo puede verse correcta inmóvil y carecer de conectividad
para animación. No asumir que todas requieren reconstrucción completa ni aceptar
una malla por verse bien en reposo. Examinar wireframe frontal, lateral y articulaciones.

## Puerta de entrada al rig

Antes de pesos, revisar componentes desconectados, superficies internas/solapadas,
dedos o brazos fusionados al cuerpo, triángulos largos y densidad irregular en
zonas móviles. Separar piezas rígidas intencionales de piel continua; no soldar
ropa, ojos, dientes ni accesorios al cuerpo. Revisar normales y bordes reales,
además del informe numérico. No cerrar boca/párpados o agujeros funcionales.

Identificar movimientos requeridos y colocar guías de articulación sobre anatomía,
no sobre triangulación irregular. Decidir postura de reposo ANTES de la reconstrucción
cuando su cambio sea necesario. Mantener volumen y espacio de axila/ingle.

## La forma que deben tener los bucles

En codo y rodilla, construir una banda alrededor de la bisagra y bandas de soporte
a ambos lados, conectadas longitudinalmente. Tres anillos pueden ser un punto de
partida, no un mínimo universal ni una garantía: repartir más geometría cuando la
flexión profunda lo requiera. La parte externa necesita sostener el volumen y la
interna necesita espacio para plegarse, sin triángulos en abanico en el pliegue.
No apilar todos los anillos en el mismo plano ni colocar un polo sobre la rótula.

En hombro, orientar el flujo desde pecho y espalda alrededor del deltoides y hacia
el brazo; dejar una zona de compresión en axila. Un cilindro insertado en el torso
con una estrella de aristas no reemplaza esa transición. En cadera, conectar pelvis,
glúteo y muslo con un flujo que permita pliegue inguinal y elevación de la pierna.
En cuello/antebrazo, disponer anillos sucesivos para repartir torsión. En muñeca y
tobillo, evitar el salto brusco de densidad y sostener mano/empeine/talón.

Buscar quads regulares donde hay flexión; se permiten triángulos donde funcionan.
Evitar polos y aristas largas atravesando pliegues, y cambios de densidad bruscos.
No usar un porcentaje de quads como aprobación. Subdivision añade muestras, pero
no arregla la dirección de los bucles. Voxel remesh no es retopología de animación.

## Ejecutar la reconstrucción necesaria

Usar la superficie original como referencia si se permite conservarla. Construir
parches de quads con extrusión/puentes o bpy/BMesh y proyectarlos con Shrinkwrap
controlado: comprobar que no salten al lado opuesto ni colapsen dedos/axila.
Unir límites con conectividad limpia, revisar normales y silueta en las mismas vistas.
No sustituir esa tarea por dar consejos: si se autorizó preparar el rig, ejecutar
la retopología necesaria con las herramientas disponibles.

Preservar materiales y apariencia; al cambiar conectividad, transferir UV/atributos
y verificar costuras/texturas. No prometer conservar shape keys por índice: necesitan
transferencia de superficie y comprobación. Si reconstruir pone en riesgo datos
que no pueden preservarse, resolver ese conflicto específico con el usuario.

## Pesos para movimiento realista

Comprobar por región: huesos anatómicamente permitidos, vértices sin influencia,
suma de deformantes, continuidad y contaminación entre lados/miembros cercanos.
En `audit`, cada región puede declarar `allowed_bones` con nombres REALES inspeccionados;
el script reporta pesos fuera de esa lista y saltos por arista. Estos últimos son
indicadores para piel blanda, no fallos obligatorios en accesorios rígidos.

Distribuir influencia entre segmentos adyacentes según la articulación y su
anatomía, sin imponer un 50/50 universal. No suavizar toda la malla: corregir el
gradiente local conservando áreas rígidas y máscaras. En shoulder/hip incluir
influencia de clavícula/pelvis/torso según el rig. Probar movimientos del miembro
vecino y del lado opuesto para detectar arrastre que una flexión aislada no muestra.

No aceptar pesos automáticos por haber terminado el operador. Después de cada
corrección, probar flexión, torsión y combinación funcional en ambos lados. Revisar
pinzamiento, volumen, intersecciones y silueta con imágenes. Huesos y pesos no
producen por sí solos deslizamiento muscular o pliegues complejos; helper/twist bones
y correctivos pueden ser necesarios cuando la base ya está demostrada.

La aceptación se basa en los movimientos requeridos, no en afirmar que los pesos
son matemáticamente perfectos. Registrar casos ejecutados y cualquier fallo residual;
no marcar listo para animar mientras las zonas incluidas fallen o no se hayan revisado.
