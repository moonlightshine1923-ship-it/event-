(function(){
 let editingId=null,version=0,reading=false,pdfModule=null;
 const fields=['personne_id','passager_nom','passager_prenom','compagnie','num_vol_aller','num_vol_retour','aeroport_depart','aeroport_arrivee','aeroport_depart_retour','aeroport_arrivee_retour','date_depart','date_arrivee','date_retour','date_arrivee_retour','classe','prix','statut','notes'];
 const dateFields=['date_depart','date_arrivee','date_retour','date_arrivee_retour'];
 function dateLocal(v){return String(v||'').replace(' ','T').slice(0,16);}
 async function people(form){
  const rows=await apiFetch(`/personnes/event/${currentEventId}`),select=form.elements.personne_id;
  select.replaceChildren(new Option('Saisir le passager ci-dessous',''));
  rows.forEach(p=>{const opt=new Option(`${p.nom} ${p.prenom}`,p.id);opt.dataset.nom=p.nom;opt.dataset.prenom=p.prenom;select.add(opt);});
 }
 function imageCanvas(bitmap){
  const canvas=document.createElement('canvas'),scale=Math.min(3,2600/bitmap.width);canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);return canvas;
 }
 function pdfText(items){
  const lines=[];
  for(const item of items){if(!item.str?.trim())continue;const y=item.transform[5];let line=lines.find(l=>Math.abs(l.y-y)<3);if(!line){line={y,items:[]};lines.push(line);}line.items.push(item);}
  return lines.sort((a,b)=>b.y-a.y).map(l=>l.items.sort((a,b)=>a.transform[4]-b.transform[4]).map(x=>x.str).join(' ')).join('\n');
 }
 async function readFile(file,isCurrent){
  if(file.type==='application/pdf'||/\.pdf$/i.test(file.name)){
   pdfModule=pdfModule||await import('/vendor/pdfjs/pdf.min.mjs');pdfModule.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/pdf.worker.min.mjs';
   const task=pdfModule.getDocument({data:new Uint8Array(await file.arrayBuffer()),cMapUrl:'/vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/pdfjs/standard_fonts/',isEvalSupported:false});
   let doc;try{
    doc=await task.promise;if(doc.numPages>8)throw Error('8 pages maximum.');const texts=[];
    for(let n=1;n<=doc.numPages;n++){
     if(!isCurrent())return '';
     const page=await doc.getPage(n),native=pdfText((await page.getTextContent()).items);
     if(native.replace(/\s/g,'').length>80)texts.push(native);
     else{const view=page.getViewport({scale:2.5});const canvas=document.createElement('canvas');canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);if(canvas.width*canvas.height>25000000)throw Error('Page trop grande.');await page.render({canvasContext:canvas.getContext('2d'),viewport:view}).promise;texts.push(await LocalOCR.recognize(canvas));}
    }
    return texts.join('\n');
   }finally{await task.destroy();}
  }
  const bitmap=await createImageBitmap(file);try{if(bitmap.width*bitmap.height>40000000)throw Error('Image trop grande.');return await LocalOCR.recognize(imageCanvas(bitmap));}finally{bitmap.close();}
 }
 window.editBillet=async function(id){
  try{
   const modal=document.getElementById('modalBillet'),form=modal.querySelector('form');form.reset();await people(form);
   const p=await apiFetch('/billets/'+id);editingId=id;form.dataset.profileMode='edit';
   for(const key of fields)if(form.elements[key])form.elements[key].value=dateFields.includes(key)?dateLocal(p[key]):p[key]??'';
   if(!p.passager_nom)form.elements.passager_nom.value=p.nom||'';if(!p.passager_prenom)form.elements.passager_prenom.value=p.prenom||'';
   ProfileForms.assets(form,p);bootstrap.Modal.getInstance(document.getElementById('modalBilletDetail'))?.hide();
   modal.querySelector('.modal-title').textContent='Fiche billet d’avion';bootstrap.Modal.getOrCreateInstance(modal).show();
  }catch(e){toast(e.message,'danger');}
 };
 document.addEventListener('DOMContentLoaded',()=>{
  const modal=document.getElementById('modalBillet'),form=modal?.querySelector('form'),status=document.getElementById('ticketReadStatus');if(!form)return;
  const statusText=t=>status.textContent=t;
  modal.addEventListener('show.bs.modal',async e=>{if(e.relatedTarget){editingId=null;form.reset();form.dataset.profileMode='create';try{await people(form);modal.dispatchEvent(new Event('profile:ready'));}catch(err){toast(err.message,'danger');}}});
  function cancelRead(){version++;statusText('');}
  modal.addEventListener('hidden.bs.modal',cancelRead);modal.addEventListener('profile:cancel',cancelRead);form.addEventListener('reset',cancelRead);
  form.elements.personne_id.addEventListener('change',()=>{const opt=form.elements.personne_id.selectedOptions[0];if(opt?.value){form.elements.passager_nom.value=opt.dataset.nom||'';form.elements.passager_prenom.value=opt.dataset.prenom||'';form.elements.passager_nom.dispatchEvent(new Event('input',{bubbles:true}));}});
  form.elements.billet.addEventListener('change',async()=>{
   const file=form.elements.billet.files?.[0];if(!file)return;
   if(reading){statusText('Lecture en cours…');return;}
   if(file.size>20*1024*1024){statusText('20 Mo maximum.');form.elements.billet.value='';return;}
   if(!/\.(pdf|jpg|jpeg|png|webp)$/i.test(file.name)){statusText('Image ou PDF uniquement.');form.elements.billet.value='';return;}
   const gen=++version;reading=true;form.dataset.scanning='true';statusText('Lecture en cours…');const save=form.querySelector('[type=submit]');save.disabled=true;
   try{
    const text=await readFile(file,()=>gen===version);if(gen!==version)return;const data=TravelParser.parseTicket(text);let count=0;
    for(const [key,value] of Object.entries(data)){if(value&&form.elements[key]){form.elements[key].value=value;form.elements[key].dispatchEvent(new Event('input',{bubbles:true}));count++;}}
    // Never change an existing person profile or silently link an ambiguous name.
    if(data.passager_nom&&data.passager_prenom){
     const norm=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
     const matches=Array.from(form.elements.personne_id.options).filter(o=>o.value&&norm(o.dataset.nom)===norm(data.passager_nom)&&norm(o.dataset.prenom)===norm(data.passager_prenom));
     form.elements.personne_id.value=matches.length===1?matches[0].value:'';
    }
    statusText(count?'Lecture terminée. Vérifiez les champs.':'Lecture incomplète. Complétez les champs.');
   }catch(e){if(gen===version)statusText('Lecture impossible. Vous pouvez saisir les champs.');console.warn('Lecture billet',e);}
   finally{reading=false;form.dataset.scanning='false';save.disabled=typeof isViewer==='function'&&isViewer();}
  });
  form.addEventListener('submit',async e=>{
   e.preventDefault();if(reading){toast('Lecture en cours…');return;}
   if(!form.elements.personne_id.value&&(!form.elements.passager_nom.value.trim()||!form.elements.passager_prenom.value.trim())){toast('Nom et prénom du passager requis','danger');return;}
   const fd=new FormData(form);if(!editingId)fd.append('event_id',currentEventId);
   try{await apiFetch('/billets'+(editingId?'/'+editingId:''),{method:editingId?'PUT':'POST',body:fd});ProfileForms.saved(form);toast('Billet sauvegardé');bootstrap.Modal.getInstance(modal).hide();form.reset();editingId=null;loadBillets();}catch(err){toast(err.message,'danger');}
  });
 });
})();
