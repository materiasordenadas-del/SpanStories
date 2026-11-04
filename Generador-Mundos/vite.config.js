import {defineConfig} from 'vite';
import {resolve} from 'node:path';
import {geographicAPI} from './server/geo-plugin.js';
import {estudioAPI} from './server/estudio-plugin.js';
import {stylePoolAPI} from './server/style-pool.js';
export default defineConfig({plugins:[geographicAPI(),estudioAPI(),stylePoolAPI()],server:{host:'127.0.0.1',port:5179,strictPort:true,fs:{strict:true,deny:['.env','.env.*','*.{crt,pem}','**/.git/**','**/.geo-cache/**','**/respaldo/**']},watch:{ignored:['**/respaldo/**','**/reports/**','**/.npm-cache/**','**/.geo-cache/**','**/.trabajo/**','**/exportaciones/**']}},preview:{host:'127.0.0.1',port:5179,strictPort:true},build:{rollupOptions:{input:{estudio:resolve(import.meta.dirname,'index.html'),atlas:resolve(import.meta.dirname,'atlas.html')},output:{manualChunks:{three:['three'],exporter:['three/addons/exporters/GLTFExporter.js']}}}}});
