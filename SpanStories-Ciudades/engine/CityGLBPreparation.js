// Container parsing runs in the transfer worker. JSON and binary are lossless;
// the renderer receives the same glTF graph without a main-thread BIN copy.
export function prepareGLB(buffer){
  if(buffer.byteLength<12)return null;
  const view=new DataView(buffer);if(view.getUint32(0,true)!==0x46546c67)return null;
  if(view.getUint32(4,true)!==2||view.getUint32(8,true)!==buffer.byteLength)throw new Error('Contenedor GLB incompatible o truncado.');
  let json,binary,offset=12;
  while(offset<buffer.byteLength){
    if(offset+8>buffer.byteLength)throw new Error('Cabecera de bloque GLB truncada.');
    const length=view.getUint32(offset,true),type=view.getUint32(offset+4,true);offset+=8;
    if(offset+length>buffer.byteLength)throw new Error('Bloque GLB truncado.');
    if(type===0x4e4f534a)json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,offset,length)));
    if(type===0x004e4942)binary=buffer.slice(offset,offset+length);
    offset+=length;
  }
  if(!json)throw new Error('Falta el bloque JSON del GLB.');
  if(!binary)return null;
  if((json.buffers?.[0]?.byteLength||0)>binary.byteLength)throw new Error('Datos binarios GLB incompletos.');
  return {json,binary};
}
