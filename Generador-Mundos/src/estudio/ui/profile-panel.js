export class ProfilePanel{
  constructor(host,{apply,reset,importModel}){
    host.innerHTML=`<details><summary>Ventanas, puertas y modelo propio</summary><p class="small">Opcional: conserva el edificio generado hasta aplicar cambios. El modelo importado debe ser un edificio sin animaciones y con sus recursos incluidos.</p>
      <fieldset id="profile-fields" disabled><div class="field"><label>Referencia (foto, enlace o nota)<input id="profile-reference"></label></div><label class="check"><input id="profile-source-style" type="checkbox"> Usar estilo arquitectónico registrado, si existe</label>
      ${[['bayWidth','Separación entre centros de ventanas (m)'],['windowWidth','Ancho de ventana (m)'],['windowHeight','Alto de ventana (m)'],['doorWidth','Ancho de puerta (m)'],['doorHeight','Alto de puerta (m)'],['balconyProbability','Balcones (0–100 %)']].map(([k,n])=>`<div class="field"><label>${n}<input id="profile-${k}" type="number" step="0.1" placeholder="Conservar plantilla"></label></div>`).join('')}
      <div class="field"><label>Modelo de edificio<select id="profile-model"><option value="">Edificio generado</option></select></label></div>
      <div class="field"><label>Giro del modelo (grados)<input id="profile-yaw" type="number" value="0" min="-360" max="360"></label></div>
      <div class="field"><label>Tamaño relativo (1 = máximo dentro de la huella)<input id="profile-scale" type="number" value="1" min="0.05" max="1" step="0.05"></label></div>
      <button class="btn primary" id="profile-apply">Aplicar perfil</button><button class="btn" id="profile-reset">Retirar perfil</button></fieldset>
      <button class="btn" id="profile-import">Importar edificio (.glb)</button><input id="profile-file" type="file" accept=".glb,model/gltf-binary" hidden>
      <p id="profile-info" class="small"></p><p class="small">Los modelos conservan proporciones y materiales; una huella irregular necesita un modelo adecuado. Una referencia registrada no equivale a fidelidad comprobada.</p><p id="profile-error" class="err" role="status"></p></details>`;
    this.host=host;
    host.querySelector('#profile-apply').onclick=async()=>{try{const facade={};for(const k of ['bayWidth','windowWidth','windowHeight','doorWidth','doorHeight','balconyProbability']){const v=host.querySelector('#profile-'+k).value;if(v!=='')facade[k]=Number(v)/(k==='balconyProbability'?100:1);}
      await apply({facade,reference:host.querySelector('#profile-reference').value,modelId:host.querySelector('#profile-model').value||null,yaw:Number(host.querySelector('#profile-yaw').value),scale:Number(host.querySelector('#profile-scale').value),fromSource:host.querySelector('#profile-source-style').checked});
    }catch(e){host.querySelector('#profile-error').textContent=e.message;}};
    host.querySelector('#profile-reset').onclick=reset;
    host.querySelector('#profile-import').onclick=()=>host.querySelector('#profile-file').click();
    host.querySelector('#profile-file').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(file)try{await importModel(file);}catch(error){host.querySelector('#profile-error').textContent=error.message;}};
  }
  update(model,id,profiles,assets,busy){
    const b=model?.buildings.find(b=>b.id===id),p=profiles[id]??{},select=this.host.querySelector('#profile-model');
    select.replaceChildren(new Option('Edificio generado',''));for(const a of assets)select.add(new Option(a.name,a.id));select.value=p.modelId??'';
    this.host.querySelector('#profile-fields').disabled=!b||busy;this.host.querySelector('#profile-import').disabled=busy;
    for(const k of ['bayWidth','windowWidth','windowHeight','doorWidth','doorHeight','balconyProbability']){const v=p.facade?.[k];this.host.querySelector('#profile-'+k).value=v==null?'':v*(k==='balconyProbability'?100:1);}
    this.host.querySelector('#profile-reference').value=p.reference??'';this.host.querySelector('#profile-yaw').value=p.yaw??0;this.host.querySelector('#profile-scale').value=p.scale??1;
    this.host.querySelector('#profile-source-style').checked=p.fromSource===true;
    this.host.querySelector('#profile-info').textContent=`${assets.length} modelos disponibles${b?' · '+b.id:''}${p.modelId?' · Se usa el modelo; los parámetros de ventanas/puertas se aplican al edificio generado':''}`;
  }
}
