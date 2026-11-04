import { componerContorno } from '../../StyleShader.js';
import { controles, crearUniformes, entorno } from './Configuracion.js';
import { vertice, fragmento } from './Superficies.js';
import { preparar, fragmentoCielo } from './Cielo.js';

export const StudioGhibli=Object.freeze({
  id:'StudioGhibli',nombre:'Studio Ghibli — Pintura tradicional',
  descripcion:'Fondos pintados, vegetación en masas de color y personajes ilustrados.',
  controles,crearUniformes,vertice,fragmento,entorno,preparar,fragmentoCielo,
  trazo:.3,contorno:shader=>componerContorno(shader,45,380),
  ambientes:{
    atardecer:{nombre:'Atardecer (luz dorada y sombras violetas)',base:'tarde'},
    lluvia:{nombre:'Lluvia (humedad y superficies mojadas)',base:'nublado'},
  },
  cielo:{cenit:'#91bed6',horizonte:'#d7e2dc',nube:'#f5f0e4',nubes:1},
});
