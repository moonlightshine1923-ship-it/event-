(function(){
 const states=new WeakMap();
 function controls(f){return Array.from(f.querySelectorAll('input[name],select[name],textarea[name]'));}
 function snapshot(f){return controls(f).map(el=>({el,value:el.type==='file'?'':el.value,checked:el.checked}));}
 function signature(f){return JSON.stringify(controls(f).map(el=>[el.name,el.type==='file'?Array.from(el.files||[],x=>x.name+':'+x.size+':'+x.lastModified):el.value,el.checked]));}
 function update(f){
  const s=states.get(f);if(!s)return;
  const edit=f.dataset.profileMode==='edit',ro=typeof isViewer==='function'&&isViewer();
  s.dirty=edit&&signature(f)!==s.signature;
  s.save.textContent=edit?'Sauvegarder':s.createLabel;
  s.save.classList.toggle('d-none',ro||(edit&&!s.dirty));s.save.disabled=ro||f.dataset.scanning==='true';
  s.cancel.classList.toggle('d-none',ro||!s.dirty);
  s.message.textContent=s.dirty?'Modifications non sauvegardées':'';
 }
 window.ProfileForms={
  saved(f){const s=states.get(f);if(s){s.dirty=false;s.signature=signature(f);s.saved=true;update(f);}},
  assets(f,p){
   f.querySelector('.profile-existing')?.remove();
   const div=document.createElement('div');div.className='profile-existing col-12';
   if(p.photo_path?.startsWith('/uploads/')){const img=document.createElement('img');img.src=p.photo_path;img.alt='Photo du profil';img.style.cssText='width:90px;height:90px;object-fit:cover;border-radius:12px';div.append(img);}
   for(const [key,label] of Object.entries({fichier_path:'Document existant',engagement_file_path:'Engagement existant',presentation_file_path:'Présentation existante',billet_file_path:'Billet existant'})){
    const path=p[key];if(typeof path!=='string')continue;
    const url='/'+path.replace(/^\//,'');if(!url.startsWith('/uploads/'))continue;
    const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener';a.textContent=label;a.className='btn btn-sm btn-outline-secondary m-2';div.append(a);
   }
   f.querySelector('.modal-body').prepend(div);
  }
 };
 document.addEventListener('DOMContentLoaded',()=>{
  for(const id of ['modalPersonne','modalExposant','modalEquipe','modalIntervenant','modalBillet']){
   const modal=document.getElementById(id),f=modal?.querySelector('form');if(!f)continue;modal.classList.remove('fade');
   const save=f.querySelector('button[type=submit]'),footer=f.querySelector('.modal-footer');if(!save||!footer)continue;
   footer.querySelectorAll('[data-bs-dismiss=modal]').forEach(b=>b.textContent='Fermer');
   const cancel=document.createElement('button');cancel.type='button';cancel.className='btn btn-outline-secondary d-none';cancel.textContent='Annuler';footer.prepend(cancel);
   const message=document.createElement('small');message.className='text-warning me-auto';footer.prepend(message);
   const state={save,cancel,message,createLabel:save.textContent,dirty:false};states.set(f,state);
   // Keep placeholders visible as labels once fields are populated.
   for(const el of controls(f))if(el.placeholder&&!el.previousElementSibling?.matches('label')){const label=document.createElement('label');label.className='form-label small';label.textContent=el.placeholder;el.before(label);}
   function begin(){state.values=snapshot(f);state.signature=signature(f);state.saved=false;state.dirty=false;update(f);}
   modal.addEventListener('show.bs.modal',e=>{
    if(e.relatedTarget)f.dataset.profileMode='create';
    if(f.dataset.profileMode!=='edit')f.querySelector('.profile-existing')?.remove();
    const ro=typeof isViewer==='function'&&isViewer();controls(f).forEach(el=>el.disabled=ro);
    begin();
   });
   modal.addEventListener('profile:ready',begin);
   f.addEventListener('input',()=>update(f));f.addEventListener('change',()=>update(f));
   f.addEventListener('submit',e=>{if(f.dataset.profileMode==='edit'&&!state.dirty){e.preventDefault();e.stopImmediatePropagation();}},true);
   cancel.onclick=()=>{
    modal.dispatchEvent(new Event('profile:cancel'));
    for(const x of state.values){if(x.el.type==='file')x.el.value='';else{x.el.value=x.value;x.el.checked=x.checked;}}
    update(f);
   };
   modal.addEventListener('hide.bs.modal',e=>{if(state.dirty&&!state.saved&&!confirm('Quitter sans sauvegarder les modifications ?'))e.preventDefault();});
   modal.addEventListener('hidden.bs.modal',()=>{state.dirty=false;f.dataset.profileMode='create';});
  }
 });
})();
