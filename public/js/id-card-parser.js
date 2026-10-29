/* Self-hosted OCR. Card images stay in the browser; only form values are saved. */
(function(){
 'use strict';
 window.LocalOCR={recognize:async function(canvas){
  if(busy)throw Error('Une lecture est déjà en cours.');
  busy=true;clearTimeout(idleTimer);
  try{const w=await getWorker();await w.setParameters({tessedit_pageseg_mode:'3',tessedit_char_whitelist:''});return (await w.recognize(canvas)).data.text;}
  finally{busy=false;releaseLater();}
 }};
 let busy=false,worker=null,workerPromise=null,idleTimer=null;
 async function getWorker(){
  clearTimeout(idleTimer);
  if(worker)return worker;
  if(!workerPromise){
   const base=new URL('/vendor/ocr/',location.origin).href;
   workerPromise=Tesseract.createWorker(['eng','fra'],1,{
    workerPath:base+'worker.min.js',corePath:base,langPath:base+'lang',cacheMethod:'none',workerBlobURL:false
   }).then(w=>{worker=w;return w;}).finally(()=>{workerPromise=null;});
  }
  return workerPromise;
 }
 function releaseLater(){
  clearTimeout(idleTimer);
  idleTimer=setTimeout(()=>{const old=worker;worker=null;old?.terminate().catch(()=>{});},60000);
 }
 function crop(source,x,y,w,h,targetWidth,contrast=false){
  const out=document.createElement('canvas');
  const sx=Math.round(source.width*x),sy=Math.round(source.height*y),sw=Math.round(source.width*w),sh=Math.round(source.height*h);
  const factor=Math.max(1,Math.min(4,targetWidth/sw));
  out.width=Math.round(sw*factor);out.height=Math.round(sh*factor);
  const ctx=out.getContext('2d');ctx.drawImage(source,sx,sy,sw,sh,0,0,out.width,out.height);
  if(contrast){
   const p=ctx.getImageData(0,0,out.width,out.height);
   for(let i=0;i<p.data.length;i+=4){const g=.299*p.data[i]+.587*p.data[i+1]+.114*p.data[i+2];const v=Math.max(0,Math.min(255,(g-128)*1.8+128));p.data[i]=p.data[i+1]=p.data[i+2]=v;}
   ctx.putImageData(p,0,0);
  }
  return out;
 }
 async function readCard(file,team,isCurrent,onResult){
  let bitmap;
  try{
   bitmap=await createImageBitmap(file);
   if(bitmap.width*bitmap.height>40000000)throw Error('Image trop grande');
   const canvas=document.createElement('canvas'),scale=Math.min(2,2000/bitmap.width);
   canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
   canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
   const w=await getWorker();if(!isCurrent())return;
   await w.setParameters({tessedit_pageseg_mode:'6',tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<'});
   const mrz=await w.recognize(crop(canvas,0,.54,1,.46,2000));
   let result=IDCardParser.parse(mrz.data.text);
   if(!isCurrent())return;
   if(result.nom||result.prenom)onResult(result);
   if(team&&!result.nom&&!result.prenom&&canvas.width>canvas.height){
    await w.setParameters({tessedit_pageseg_mode:'6',tessedit_char_whitelist:'0123456789'});
    const numeric=await w.recognize(crop(canvas,.40,.47,.40,.15,1600,true));
    result.nin=IDCardParser.numericNin(numeric.data.text);
    if(!isCurrent())return;
    if(result.nin)onResult({nin:result.nin});
   }
   // Full-card fallback only when targeted reads did not identify either side.
   if(!result.nom&&!result.prenom&&!result.nin){
    await w.setParameters({tessedit_pageseg_mode:'3',tessedit_char_whitelist:''});
    const full=await w.recognize(canvas);
    result=IDCardParser.parse(full.data.text);
    if(team&&!result.nin&&!/passport|passeport|P<[A-Z]{3}/i.test(full.data.text))result.nin=IDCardParser.numericNin(full.data.text);
    if(isCurrent())onResult(result);
   }
  }finally{bitmap?.close();}
 }
 document.addEventListener('DOMContentLoaded',()=>{
  ['modalPersonne','modalExposant','modalEquipe','modalIntervenant'].forEach(id=>{
   const modal=document.getElementById(id),form=modal?.querySelector('form'),body=form?.querySelector('.modal-body');
   if(!body)return;
   const team=id==='modalEquipe',panel=document.createElement('div');
   panel.className='col-12 id-scan-panel';
   panel.innerHTML=`<div class="border rounded p-3 mb-2 bg-light"><b>Carte nationale / Passeport</b><div class="d-flex gap-2 flex-wrap mt-2"><button type="button" class="btn btn-sm btn-outline-primary scan-import">Importer recto / verso</button><button type="button" class="btn btn-sm btn-outline-primary scan-camera">Prendre une photo</button><button type="button" class="btn btn-sm btn-outline-secondary scan-clear">Effacer le scan</button></div><div class="scan-live d-none mt-2"><video class="scan-video" autoplay playsinline muted style="width:100%;max-height:300px"></video><button type="button" class="btn btn-sm btn-primary scan-snap">Capturer</button><button type="button" class="btn btn-sm btn-outline-secondary scan-stop">Fermer la caméra</button></div><input type="file" accept="image/jpeg,image/png,image/webp" multiple class="d-none scan-file"><input type="file" accept="image/*" capture="environment" class="d-none scan-capture"><p class="small mt-2 mb-0 scan-status" role="status" aria-live="polite"></p></div>`;
   body.prepend(panel);
   let generation=0,stream=null;
   const el=cls=>panel.querySelector('.'+cls),status=text=>el('scan-status').textContent=text;
   const stopCamera=()=>{stream?.getTracks().forEach(t=>t.stop());stream=null;el('scan-video').srcObject=null;el('scan-live').classList.add('d-none');};
   const clear=()=>{stopCamera();generation++;panel.querySelectorAll('input').forEach(i=>i.value='');status('');};
   el('scan-import').onclick=()=>el('scan-file').click();
   el('scan-camera').onclick=async()=>{
    if(busy){status('Lecture en cours…');return;}
    if(!navigator.mediaDevices?.getUserMedia){el('scan-capture').click();return;}
    try{const gen=generation;stopCamera();stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920}},audio:false});if(gen!==generation){stopCamera();return;}el('scan-video').srcObject=stream;el('scan-live').classList.remove('d-none');status('Cadrez la carte.');}
    catch(e){status('Caméra indisponible.');}
   };
   el('scan-stop').onclick=stopCamera;
   el('scan-snap').onclick=()=>{
    const v=el('scan-video');if(!v.videoWidth){status('Patientez…');return;}
    const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d').drawImage(v,0,0);
    c.toBlob(blob=>{stopCamera();if(blob)scan({files:[new File([blob],'carte.jpg',{type:'image/jpeg'})],value:''});},'image/jpeg',.95);
   };
   el('scan-clear').onclick=clear;
   modal.addEventListener('hidden.bs.modal',clear);modal.addEventListener('profile:cancel',clear);form.addEventListener('reset',clear);
   async function scan(input){
    if(typeof isViewer==='function'&&isViewer()){status('Compte en lecture seule.');return;}
    const files=Array.from(input.files||[]);if(!files.length)return;
    if(busy){status('Lecture en cours…');input.value='';return;}
    if(files.length>2){status('Choisissez au maximum 2 photos.');input.value='';return;}
    if(files.some(f=>!/^image\/(jpeg|png|webp)$/.test(f.type)||f.size>15*1024*1024)){status('Images JPG, PNG ou WEBP, 15 Mo maximum chacune.');input.value='';return;}
    if(!window.Tesseract||!window.IDCardParser){status('Module de lecture indisponible.');return;}
    const gen=++generation;busy=true;form.dataset.scanning='true';clearTimeout(idleTimer);stopCamera();
    panel.querySelectorAll('button').forEach(b=>b.disabled=true);
    const submitButtons=form.querySelectorAll('button[type="submit"]');
    const submitStates=Array.from(submitButtons,b=>b.disabled);submitButtons.forEach(b=>b.disabled=true);
    let filled=false,failed=false;
    function apply(result){
     for(const key of ['nom','prenom',...(team?['nin']:[])]){
      const value=result[key],field=form.elements[key];
      if(!field||!value||(key==='nin'&&!/^\d{18}$/.test(value)))continue;
      field.value=value;field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));filled=true;
     }
    }
    try{
     for(let i=0;i<files.length;i++){
      if(gen!==generation)break;
      status(files.length>1?`Lecture en cours… ${i+1}/${files.length}`:'Lecture en cours…');
      try{await readCard(files[i],team,()=>gen===generation,apply);}catch(e){console.warn('Lecture carte impossible',e);failed=true;}
     }
     if(gen===generation)status(filled?(failed?'Lecture partielle. Vérifiez les champs.':'Lecture terminée.'): 'Lecture impossible. Réessayez avec une photo nette.');
    }finally{
     busy=false;form.dataset.scanning='false';releaseLater();panel.querySelectorAll('button').forEach(b=>b.disabled=false);submitButtons.forEach((b,i)=>b.disabled=submitStates[i]);input.value='';
    }
   }
   el('scan-file').onchange=e=>scan(e.target);el('scan-capture').onchange=e=>scan(e.target);
  });
 });
})();
