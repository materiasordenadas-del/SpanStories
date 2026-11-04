import * as THREE from 'three';
import {AtlasPackage} from '../export/package-loader.js';
import {createGMaterial} from './gmaterial.js';
// Solo la revisión en Atlas adapta al G-buffer; el paquete conserva sus materiales estándar.
export class PackagePreview{
  constructor(viewer,url,onChange=()=>{}){this.viewer=viewer;this.url=url;this.onChange=onChange;this.last=new THREE.Vector3(1e9,0,0);this.pending=false;this.closed=false;}
  async open(){this.package=await new AtlasPackage().open(this.url);await this.refresh(true);return this.package.group;}
  adapt(){this.package.group.traverse(o=>{
    if(!o.isMesh||[o.material].flat().every(m=>m.userData.previewAdapted))return;const g=o.geometry,n=g.attributes.position.count;o._ssPreviewOriginal=o.material;
    if(!g.attributes.color)g.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(n*3).fill(1),3));
    if(!g.attributes.aId)g.setAttribute('aId',g.attributes._entity_id??g.attributes.__entity_id??new THREE.Float32BufferAttribute(new Float32Array(n),1));
    if(!g.attributes.aSurf)g.setAttribute('aSurf',g.attributes._surface??g.attributes.__surface??g.attributes._asurf??new THREE.Float32BufferAttribute(new Float32Array(n).fill(10),1));
    const convert=source=>{source.map?.updateMatrix();const mat=createGMaterial({sun:this.viewer.sunDir,map:source.map,mapTransform:source.map?.matrix,baseColor:source.color,alphaTest:source.alphaTest,instanceTint:false,doubleSided:source.side===THREE.DoubleSide,surf:g.attributes._surface||g.attributes.__surface?-1:source.metalness>.6?4:-1});mat.userData.previewAdapted=true;mat.uniforms.uMeshId.value=.29;return mat;};
    o.material=Array.isArray(o.material)?o.material.map(convert):convert(o.material);
  });}
  async refresh(force=false){if(this.closed||this.pending)return;const target=this.viewer.controls.target;if(!force&&target.distanceTo(this.last)<20)return;this.last.copy(target);this.pending=true;
    try{await this.package.nearby(target,{radius:220,maxSectors:64});if(this.closed)return;this.adapt();this.viewer.needsShadow=true;this.viewer.dirty=true;this.onChange(this.package);}finally{this.pending=false;}
  }
  dispose(){this.closed=true;this.package?.dispose();}
}
