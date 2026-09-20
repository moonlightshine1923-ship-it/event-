// Event Manager Algeria - Frontend SPA
const API = '/api';
let token = localStorage.getItem('token');
let currentUser = null;
let currentEventId = localStorage.getItem('currentEventId') || null;
let wilayasCache = [];
let eventsCache = [];
let editingHotelId = null;
let editingPersonneId = null;
let editingExposantId = null;
let editingExposantPersonneId = null;
let editingEmployeId = null;
let editingSponsorId = null;

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// Date d'événement en édition (null = création)
let editingEventId = null;

// Affiche une date en JJ/MM/AAAA, sans l'horodatage ISO (reste déterministe)
function fmtDate(v){
  if(!v) return '—';
  const s = String(v);
  // ISO "2026-12-31T23:00:00.000Z" ou "2026-12-31" → extrait AAAA-MM-JJ
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(s);
  if(!isNaN(d)){
    return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`;
  }
  return s;
}

function authHeaders(isJson=true){
  const h = {};
  if(isJson) h['Content-Type']='application/json';
  if(token) h['Authorization']='Bearer '+token;
  return h;
}

async function apiFetch(url, opts={}){
  opts.headers = { ...(opts.headers||{}), ...authHeaders(!opts.body || !(opts.body instanceof FormData)) };
  if(opts.body && typeof opts.body !== 'string' && !(opts.body instanceof FormData)){
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(API+url, opts);
  if(res.status===401){
    logout();
    throw new Error('Non authentifié');
  }
  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error||'Erreur API');
  return data;
}

function toast(msg, type='success'){
  const c = $('#toastContainer');
  const el = document.createElement('div');
  el.className=`toast align-items-center text-bg-${type} border-0 show mb-2`;
  el.innerHTML=`<div class="d-flex"><div class="toast-body">${msg}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
  c.appendChild(el);
  setTimeout(()=>el.remove(),4000);
}

// Auth
async function login(){
  const identifier = $('#loginEmail').value.trim();
  const password = $('#loginPassword').value;
  try{
    const data = await fetch(API+'/auth/login',{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email: identifier, username: identifier, password })}).then(r=>r.json());
    if(data.error) throw new Error(data.error);
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('token', token);
    $('#loginPage').classList.add('d-none');
    $('#appWrapper').classList.remove('d-none');
    await initApp();
    toast('Bienvenue '+currentUser.username);
  }catch(e){ toast(e.message,'danger'); }
}

function logout(){
  localStorage.removeItem('token');
  token=null;
  $('#appWrapper').classList.add('d-none');
  $('#loginPage').classList.remove('d-none');
}

function initialsOf(name){
  if(!name) return 'U';
  const parts = String(name).trim().split(/[\s._-]+/).filter(Boolean);
  if(parts.length>=2) return (parts[0][0]+parts[1][0]).toUpperCase();
  return name.slice(0,2).toUpperCase();
}
function applyUser(){
  const uname = currentUser?.username || 'Utilisateur';
  const role = currentUser?.role || 'Connecté';
  $('#userDisplay').textContent = uname;
  $('#userRole').textContent = role;
  $('#userChipName').textContent = uname;
  $('#userChipRole').textContent = role;
  const initials = initialsOf(uname);
  $('#sidebarAvatar').textContent = initials;
  $('#topbarAvatar').textContent = initials;
  $('#umName').textContent = uname;
  $('#umRole').textContent = role;
}

async function initApp(){
  try{
    currentUser = await apiFetch('/auth/me');
    applyUser();
  }catch{
    // check if first admin needed
    try{
      const health = await fetch(API+'/health').then(r=>r.json());
    }catch{}
  }
  applyRoleVisibility();
  await loadWilayas();
  await loadEvents();
  await loadHotels();
  await refreshDashboard();
  // check token
  $('#loginPage').classList.add('d-none');
  $('#appWrapper').classList.remove('d-none');
  // Écran d'accueil par défaut : menu principal des événements
  showSection('events');
}

// ——— Accès / visibilité selon le rôle ———
const MANAGE_USERS_ROLES = ['super_admin','admin'];
// Normalize a role so "super_admin", "superAdmin", "Super_Admin", "SUPERADMIN" all match.
function normalizeRole(r){ return String(r||'').toLowerCase().replace(/[^a-z]/g,''); }
function isPrivilegedRole(r){
  const n = normalizeRole(r);
  return n==='superadmin' || n==='admin' || n==='administrator';
}
// Full management access: admin/super-admin role, OR an account whose permissions
// grant the "users" module or "all" access.
function canManageUsers(){
  if(!currentUser) return false;
  if(isPrivilegedRole(currentUser.role)) return true;
  const p = currentUser.permissions || {};
  return !!(p.all || p.users);
}
function applyRoleVisibility(){
  const can = canManageUsers();
  const link = document.querySelector('.sidebar .nav-link[data-section="users"]');
  if(link) link.style.display = can ? '' : 'none';
  if(!can){
    const sec = $('#section-users');
    if(sec && !sec.classList.contains('d-none')) sec.classList.add('d-none');
  }
}

async function loadWilayas(){
  try{
    wilayasCache = await apiFetch('/wilayas');
    const sel = $$('.wilaya-select');
    sel.forEach(s=>{
      s.innerHTML='<option value="">-- Choisir Wilaya --</option>'+ wilayasCache.map(w=>`<option value="${w.id}">${w.code} - ${w.nom}</option>`).join('');
      if(currentEventId){
        // keep
      }
    });
  }catch{}
}

async function loadEvents(){
  try{
    eventsCache = await apiFetch('/events');
    const opts = eventsCache.map(e=>`<option value="${e.id}" ${String(e.id)===String(currentEventId)?'selected':''}>${e.titre} (${e.wilaya_nom||''})</option>`).join('');
    const sel = $('#eventSelector');
    if(sel){
      sel.innerHTML='<option value="">-- Tous / Sélectionner Événement --</option>'+opts;
    }
    const tsel = $('#topbarEventSelector');
    if(tsel){
      tsel.innerHTML='<option value="">-- Tous / Choisir un événement --</option>'+opts;
    }
    const listEl = $('#eventsTableBody');
    if(listEl){
      listEl.innerHTML = eventsCache.map(ev=>`
        <tr>
          <td><b>${ev.titre}</b><br><small class="text-muted">${ev.theme||''}</small></td>
          <td>${ev.wilaya_nom||''}<br><small>${ev.emplacement||''}</small></td>
          <td>${fmtDate(ev.date_debut)} → ${fmtDate(ev.date_fin)}</td>
          <td><span class="badge bg-${ev.statut==='planifie'?'success': ev.statut==='en_cours'?'warning':'secondary'}">${ev.statut}</span></td>
          <td>${ev.total_personnes||0} pers / ${ev.total_exposants||0} exp</td>
          <td>
            <button class="btn btn-sm btn-outline-primary" onclick="selectEvent(${ev.id})"><i class="bi bi-eye"></i></button>
            <button class="btn btn-sm btn-outline-secondary" onclick="editEvent(${ev.id})"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteEvent(${ev.id})"><i class="bi bi-trash"></i></button>
          </td>
        </tr>
      `).join('');
    }
  }catch(e){ console.error(e); }
}

function selectEvent(id){
  currentEventId=id;
  localStorage.setItem('currentEventId', id);
  // synchronise les deux sélecteurs (sidebar + topbar)
  const sel = $('#eventSelector'); if(sel) sel.value = String(id);
  const tsel = $('#topbarEventSelector'); if(tsel) tsel.value = String(id);
  refreshDashboard();
  showSection('dashboard');
  toast('Événement sélectionné');
}

// Menu principal : cartes des événements
const STATUS_META = {
  brouillon:{label:'Brouillon', cls:'bg-soft-secondary', grad:'linear-gradient(135deg,#8a95ad,#5b667d)'},
  planifie:{label:'Planifié', cls:'bg-soft-info', grad:'linear-gradient(135deg,#0ea5e9,#0369a1)'},
  en_cours:{label:'En cours', cls:'bg-soft-success', grad:'linear-gradient(135deg,#12b76a,#0b8a4c)'},
  termine:{label:'Terminé', cls:'bg-soft-primary', grad:'linear-gradient(135deg,#4f8bff,#2456e0)'},
  annule:{label:'Annulé', cls:'bg-soft-danger', grad:'linear-gradient(135deg,#ef4444,#c72d2d)'}
};
function loadHomeEvents(){
  const grid = $('#homeEventsGrid');
  if(!grid) return;
  if(!eventsCache.length){
    grid.innerHTML = `<div class="col-12"><div class="home-empty">
      <i class="bi bi-calendar-plus"></i>
      <h5>Aucun événement pour l'instant</h5>
      <p>Créez votre premier événement pour commencer à le piloter.</p>
      <button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#modalEvent"><i class="bi bi-plus-lg me-1"></i>Créer un événement</button>
    </div></div>`;
    return;
  }
  grid.innerHTML = eventsCache.map(ev=>{
    const st = STATUS_META[ev.statut] || STATUS_META['brouillon'];
    const isActive = String(ev.id)===String(currentEventId);
    return `
    <div class="col-md-6 col-xl-4">
      <div class="event-card ${isActive?'is-active':''}" style="--ev-grad:${st.grad}">
        <div class="event-card-top">
          <div class="ev-badge"><span class="badge ${st.cls}">${st.label}</span></div>
          <div class="ev-count"><i class="bi bi-people"></i> ${ev.total_personnes||0}</div>
        </div>
        <div class="event-card-body">
          <div class="ev-title">${ev.titre}</div>
          <div class="ev-meta"><i class="bi bi-geo-alt"></i> ${ev.wilaya_nom||'—'}${ev.emplacement?` · ${ev.emplacement}`:''}</div>
          <div class="ev-meta"><i class="bi bi-calendar-range"></i> ${fmtDate(ev.date_debut)} → ${fmtDate(ev.date_fin)}</div>
          <div class="ev-meta"><i class="bi bi-shop"></i> ${ev.total_exposants||0} exposants</div>
        </div>
        <div class="event-card-foot">
          <div class="d-flex gap-2">
            <button class="btn btn-sm btn-primary flex-grow-1" onclick="selectEvent(${ev.id})"><i class="bi bi-box-arrow-in-right me-1"></i> ${isActive?'Ouvrir':'Entrer'}</button>
            <button class="btn btn-sm btn-outline-secondary" onclick="editEvent(${ev.id})" title="Modifier"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteEvent(${ev.id})" title="Supprimer"><i class="bi bi-trash"></i></button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function loadHotels(filterWilaya=null){
  try{
    let url='/hotels';
    if(filterWilaya) url+=`?wilaya_id=${filterWilaya}`;
    const hotels = await apiFetch(url);
    $('#hotelsTableBody').innerHTML = hotels.map(h=>`
      <tr>
        <td>${h.nom}<br><small class="text-muted">${h.etoiles}★ ${h.wilaya_nom||''}</small></td>
        <td>${h.adresse||''}<br>${h.telephone||''}</td>
        <td>${h.capacite||0}</td>
        <td>${h.prix_moyen} DA</td>
        <td>
          <button class="btn btn-sm btn-outline-secondary" onclick="editHotel(${h.id})"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteHotel(${h.id})"><i class="bi bi-trash"></i></button>
        </td>
      </tr>
    `).join('');
    // also populate hotel select for reservations
    const sel = $$('.hotel-select');
    sel.forEach(s=>{
      s.innerHTML='<option value="">-- Hôtel --</option>'+hotels.map(h=>`<option value="${h.id}">${h.nom} (${h.wilaya_nom})</option>`).join('');
    });
  }catch{}
}

function onWilayaChangeForHotels(){
  const wid = $('#filterHotelWilaya').value;
  loadHotels(wid||null);
}

// Charge la liste des hôtels d'une wilaya dans le sélecteur du formulaire événement.
// On stocke le nom d'hôtel dans le champ `emplacement` (compatible base existante).
async function loadEventHotels(wilayaId, selectedName){
  const sel = $('#eventHotelSelect');
  if(!sel) return;
  if(!wilayaId){
    sel.innerHTML = '<option value="">-- Choisir hôtel --</option>';
    return;
  }
  try{
    const hotels = await apiFetch('/hotels?wilaya_id='+wilayaId);
    sel.innerHTML = '<option value="">-- Choisir hôtel --</option>' +
      hotels.map(h=>`<option value="${h.nom}">${h.nom}${h.etoiles?` · ${h.etoiles}★`:''}${h.prix_moyen?` · ${h.prix_moyen} DA`:''}</option>`).join('');
    if(selectedName) sel.value = selectedName;
  }catch(e){ console.error(e); }
}

// Dashboard
async function refreshDashboard(){
  if(!currentEventId){
    $('#dashboardEmpty').classList.remove('d-none');
    $('#dashboardContent').classList.add('d-none');
    return;
  }
  $('#dashboardEmpty').classList.add('d-none');
  $('#dashboardContent').classList.remove('d-none');
  try{
    const finance = await apiFetch(`/events/${currentEventId}/finance`);
    const stats = await apiFetch(`/events/${currentEventId}/stats`);
    const ev = eventsCache.find(x=>String(x.id)===String(currentEventId));
    // Hero
    if(ev){
      const dt = $('#dashEventTitle'); if(dt) dt.textContent = ev.titre||'Tableau de bord';
      const spMap = { brouillon:'Brouillon', planifie:'Planifié', en_cours:'En cours', termine:'Terminé', annule:'Annulé' };
      const dm = $('#dashEventMeta');
      if(dm){
        dm.innerHTML = `<i class="bi bi-geo-alt me-1"></i>${ev.wilaya_nom||''}${ev.emplacement?` · ${ev.emplacement}`:''}` +
          ` &nbsp;<i class="bi bi-calendar-range me-1 ms-2"></i>${fmtDate(ev.date_debut)} → ${fmtDate(ev.date_fin)}` +
          ` &nbsp;<span class="badge bg-soft-success ms-1">${spMap[ev.statut]||ev.statut}</span>`;
      }
      const hb = $('#dashHeroBudget'); if(hb) hb.textContent = Number(finance.entrants.total||0).toLocaleString()+' DA';
      const hbal = $('#dashHeroBalance'); if(hbal) hbal.textContent = Number(finance.balance||0).toLocaleString()+' DA';
    }
    // finance
    $('#financeEntrants').textContent = finance.entrants.total.toLocaleString()+' DA';
    $('#financeSortants').textContent = finance.sortants.total.toLocaleString()+' DA';
    const balEl = $('#financeBalance');
    if(balEl) balEl.textContent = (finance.balance>=0?'+':'−')+Math.abs(finance.balance).toLocaleString()+' DA';
    const dashFinanceDetail = [
      { label:'Budget initial', v:finance.entrants.budget_initial, cls:'pos', dot:'#2f6bff' },
      { label:'Exposants payés', v:finance.entrants.exposants, cls:'pos', dot:'#0ea5e9' },
      { label:'Sponsors', v:finance.entrants.sponsors, cls:'pos', dot:'#12b76a' },
      { label:'Employés', v:finance.sortants.employes, cls:'neg', dot:'#ef4444' },
      { label:'Conventions', v:finance.sortants.conventions, cls:'neg', dot:'#f59e0b' },
      { label:'Billets', v:finance.sortants.billets, cls:'neg', dot:'#8b5cf6' },
      { label:'Hôtels', v:finance.sortants.hotels, cls:'neg', dot:'#06b6d4' },
      { label:'Restauration', v:finance.sortants.restauration, cls:'neg', dot:'#ec4899' }
    ];
    $('#financeDetail').innerHTML = dashFinanceDetail.map(r=>`
      <div class="fb-row"><div class="fb-left"><span class="fb-dot" style="background:${r.dot}"></span>${r.label}</div>
      <span class="fb-amt ${r.cls}">${r.cls==='neg'?'−':'+'}&nbsp;${Number(r.v||0).toLocaleString()} DA</span></div>
    `).join('');
    // stats
    $('#statPersonnes').textContent = (stats.personnes?.total||0);
    $('#statExposants').textContent = (stats.personnes?.exposants||0);
    $('#statVip').textContent = (stats.personnes?.vip||0);
    $('#statStands').textContent = `${stats.stands?.occupes||0}/${stats.stands?.total||0}`;
    $('#statEmployes').textContent = (stats.employes?.total||0);
    $('#statSponsors').textContent = (stats.sponsors?.total||0);
    const soc = $('#standsOccBadge');
    if(soc){ const occ=stats.stands?.occupes||0, tot=stats.stands?.total||0; soc.textContent=`${tot? Math.round(occ/tot*100):0}% occupé`; soc.classList.toggle('success', tot>0 && occ/tot>0.5); }

    // load notifications + alerts
    loadNotifications();
    loadHotelAlerts();
    loadExposants();
    loadStandsPlan();
    loadPersonnes();
    loadEmployes();
    loadSponsors();
    loadRestauration();
    loadProgrammes();
    loadConventions();
    loadBillets();
    loadReservations();
    loadAudit();
  }catch(e){ console.error(e); toast(e.message,'danger'); }
}

// Exposants
async function loadExposants(){
  if(!currentEventId) return;
  try{
    const expos = await apiFetch(`/exposants/event/${currentEventId}`);
    $('#exposantsTableBody').innerHTML = expos.map(ex=>`
      <tr>
        <td><span class="badge bg-soft-primary">${ex.type||'Exposant'}</span></td>
        <td>${ex.nom} ${ex.prenom}<br><small>${ex.entreprise||''} | ${ex.email||''}</small></td>
        <td>${ex.domaine_activite||''}<br><small>Convoqué par: ${ex.convoque_par||''}</small></td>
        <td><span class="badge bg-${ex.stand_statut==='occupe'?'success':'warning'}">${ex.stand_numero||'—'} ${ex.zone||''}</span></td>
        <td><span class="badge bg-${ex.a_paye?'success':'danger'}">${ex.a_paye?'Payé':'Non payé'}</span><br>${ex.methode_paiement||''} ${ex.montant_paye||0} DA</td>
        <td>
          <button class="btn btn-sm btn-outline-secondary" onclick="viewFicheTech(${ex.id})" title="Fiche technique"><i class="bi bi-file-text"></i></button>
          <button class="btn btn-sm btn-outline-secondary" onclick="editExposant(${ex.id})" title="Modifier"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteExposant(${ex.id})" title="Supprimer"><i class="bi bi-trash"></i></button>
        </td>
      </tr>
    `).join('');
  }catch{}
}

// Personnes
async function loadPersonnes(){
  if(!currentEventId) return;
  try{
    const typeFilter = $('#filterPersonneType')?.value || '';
    let url=`/personnes/event/${currentEventId}`;
    if(typeFilter) url+=`?type=${typeFilter}`;
    const pers = await apiFetch(url);
    $('#personnesTableBody').innerHTML = pers.map(p=>`
      <tr>
        <td><span class="badge bg-${p.type==='exposant'?'primary': p.type==='invite_vip'?'warning text-dark':'info'}">${p.type}</span></td>
        <td>${p.nom} ${p.prenom}</td>
        <td>${p.email||''}<br><small>${p.telephone||''}</small></td>
        <td>${p.entreprise||''} - ${p.poste||''}</td>
        <td>${p.wilaya_nom||''}</td>
        <td>
          <button class="btn btn-sm btn-outline-secondary" onclick="editPersonne(${p.id})" title="Modifier"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-outline-danger" onclick="deletePersonne(${p.id})" title="Supprimer"><i class="bi bi-trash"></i></button>
        </td>
      </tr>
    `).join('');
    // populate person selects
    const sel = $$('.personne-select');
    sel.forEach(s=>{
      s.innerHTML='<option value="">-- Personne --</option>'+pers.map(p=>`<option value="${p.id}">${p.nom} ${p.prenom} (${p.type})</option>`).join('');
    });
  }catch{}
}

// Stands plan
async function loadStandsPlan(){
  if(!currentEventId) return;
  try{
    const stands = await apiFetch(`/stands/event/${currentEventId}`);
    const grid = $('#standsGrid');
    if(!grid) return;
    if(!stands.length){
      grid.innerHTML='<div class="p-4 text-center text-muted">Aucun stand. Générez un plan automatique.</div>';
      return;
    }
    grid.innerHTML = stands.map(s=>`
      <div class="stand-box ${s.statut}" title="${s.numero} - ${s.taille||''} - ${s.entreprise||''}">
        <strong>${s.numero}</strong>
        <small>${s.statut}</small>
        ${s.nom?`<small class="text-truncate">${s.nom} ${s.prenom||''}</small>`:''}
        ${s.entreprise?`<small>${s.entreprise}</small>`:''}
      </div>
    `).join('');
    const cnt = (st)=>stands.filter(s=>s.statut===st).length;
    $('#standsLegend').innerHTML = `
      <span class="stand-legend-chip"><span class="dot" style="background:#fff;border:1px solid #e6ecf5"></span> Libres <b>${cnt('libre')}</b></span>
      <span class="stand-legend-chip"><span class="dot" style="background:#fdf1e0"></span> Réservés <b>${cnt('reserve')}</b></span>
      <span class="stand-legend-chip"><span class="dot" style="background:#e7f8ef"></span> Occupés <b>${cnt('occupe')}</b></span>
      <span class="stand-legend-chip"><span class="dot" style="background:#eef0f4"></span> Indisponibles <b>${cnt('indisponible')}</b></span>
      <span class="stand-legend-chip ms-auto">Total <b>${stands.length}</b></span>
    `;
  }catch{}
}

// Employes
async function loadEmployes(){
  if(!currentEventId) return;
  try{
    const empl = await apiFetch(`/employes/event/${currentEventId}`);
    $('#employesTableBody').innerHTML = empl.map(e=>`
      <tr>
        <td>${e.nom} ${e.prenom}<br><small>${e.email||''}</small></td>
        <td><span class="badge bg-dark">${e.poste}</span> ${e.poste_custom||''}</td>
        <td>${e.tache||''}<br><small>Lieu: ${e.lieu_affectation||''}</small></td>
        <td>${e.salaire_jour} x ${e.nb_jours} = <b>${e.salaire_total} DA</b></td>
        <td><span class="badge bg-${e.statut_paiement==='paye'?'success': e.statut_paiement==='partiel'?'warning':'danger'}">${e.statut_paiement}</span></td>
        <td>
          <button class="btn btn-sm btn-outline-secondary" onclick="editEmploye(${e.id})" title="Modifier"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteEmploye(${e.id})" title="Supprimer"><i class="bi bi-trash"></i></button>
        </td>
      </tr>
    `).join('');
  }catch{}
}

// Sponsors
async function loadSponsors(){
  if(!currentEventId) return;
  try{
    const spons = await apiFetch(`/sponsors/event/${currentEventId}`);
    $('#sponsorsTableBody').innerHTML = spons.map(s=>`
      <tr>
        <td><span class="badge badge-${s.type}">${s.type.toUpperCase()}</span></td>
        <td>${s.nom}</td>
        <td>${s.entreprise||''}<br>${s.contact_nom||''} ${s.contact_email||''}</td>
        <td>${s.montant} DA<br><span class="badge bg-${s.statut_paiement==='paye'?'success':'warning'}">${s.statut_paiement}</span></td>
        <td>${s.avantages||''}</td>
        <td>
          <button class="btn btn-sm btn-outline-secondary" onclick="editSponsor(${s.id})" title="Modifier"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteSponsor(${s.id})" title="Supprimer"><i class="bi bi-trash"></i></button>
        </td>
      </tr>
    `).join('');
  }catch{}
}
function setSponsorModalMode(mode){
  const t=$('#modalSponsorTitle'); if(t) t.textContent = mode==='edit' ? 'Modifier Sponsor' : 'Ajouter Sponsor';
  const b=$('#modalSponsorBtn'); if(b) b.textContent = mode==='edit' ? 'Enregistrer' : 'Enregistrer';
}
async function editSponsor(id){
  try{
    const list = await apiFetch(`/sponsors/event/${currentEventId}`);
    const s = list.find(x=>String(x.id)===String(id));
    if(!s) return;
    editingSponsorId = id;
    setSponsorModalMode('edit');
    const form = $('#formSponsor'); form.reset();
    const set=(n,v)=>{const el=form.querySelector(`[name=${n}]`); if(el) el.value=(v==null)?'':v;};
    set('nom',s.nom); set('type',s.type); set('entreprise',s.entreprise); set('montant',s.montant);
    set('contact_nom',s.contact_nom); set('contact_email',s.contact_email); set('contact_tel',s.contact_tel);
    set('avantages',s.avantages); set('statut_paiement',s.statut_paiement);
    bootstrap.Modal.getOrCreateInstance($('#modalSponsor')).show();
  }catch(err){ toast(err.message||'Erreur de chargement','danger'); }
}

// Restauration
async function loadRestauration(){
  if(!currentEventId) return;
  try{
    const config = await apiFetch(`/restauration/event/${currentEventId}/config`);
    const menus = await apiFetch(`/restauration/event/${currentEventId}/menus`);
    const affect = await apiFetch(`/restauration/event/${currentEventId}/affectations`);
    const summary = await apiFetch(`/restauration/event/${currentEventId}/summary`);
    $('#restaurationConfig').innerHTML = `
      <div class="row">
        <div class="col-6">Salles VIP: ${config.nb_salles_vip} (cap ${config.capacite_salle_vip})</div>
        <div class="col-6">Salles Normales: ${config.nb_salles_normales} (cap ${config.capacite_salle_normale})</div>
      </div>
    `;
    $('#restaurationMenusBody').innerHTML = menus.map(m=>`
      <tr><td><span class="badge bg-secondary">${m.type_repas}</span> ${m.nom_menu}</td><td>${m.description||''}</td><td>${m.prix_par_personne} DA</td><td>${m.fournisseur||''}</td></tr>
    `).join('');
    $('#restaurationAffectBody').innerHTML = affect.map(a=>`
      <tr><td>${a.nom} ${a.prenom} <span class="badge bg-${a.type==='invite_vip'?'warning':'light text-dark'}">${a.type}</span></td><td><span class="badge bg-${a.type_salle==='vip'?'warning text-dark':'primary'}">${a.type_salle}</span></td><td>${a.nom_menu||''} (${a.type_repas||''})</td><td>${a.prix_par_personne||0} x ${a.nb_personnes}</td></tr>
    `).join('');
    $('#restaurationSummary').innerHTML = `VIP: ${summary.vip} | Normale: ${summary.normale} | Total: ${summary.total} DA`;
  }catch{}
}

// Programme
async function loadProgrammes(){
  if(!currentEventId) return;
  try{
    const prog = await apiFetch(`/programmes/event/${currentEventId}`);
    $('#programmesTableBody').innerHTML = prog.map(p=>`
      <tr>
        <td>${p.jour} ${p.heure_debut}→${p.heure_fin}</td>
        <td><b>${p.titre}</b><br><small>${p.description||''} ${p.theme?'- Thème: '+p.theme:''}</small></td>
        <td>${p.intervenant_nom||''} ${p.intervenant_prenom||''}<br><small>${p.intervenant_poste||''} ${p.intervenant_is_vip?'<span class="badge bg-warning text-dark">VIP</span>':''}</small></td>
        <td>${p.salle||''}</td>
        <td>${p.presentation_file?`<a href="/${p.presentation_file}" target="_blank" class="btn btn-sm btn-outline-primary"><i class="bi bi-file-earmark"></i> Voir</a>`:'—'}</td>
      </tr>
    `).join('');
  }catch{}
}

// Conventions
async function loadConventions(){
  if(!currentEventId) return;
  try{
    const conv = await apiFetch(`/conventions/event/${currentEventId}`);
    $('#conventionsTableBody').innerHTML = conv.map(c=>`
      <tr><td><span class="badge bg-dark">${c.type}</span></td><td>${c.fournisseur}<br>${c.titre||''}</td><td>${c.montant} DA (payé ${c.montant_paye})</td><td>${c.statut}</td><td>${(c.document_paths||[]).length} docs</td></tr>
    `).join('');
  }catch{}
}

// Billets
async function loadBillets(){
  if(!currentEventId) return;
  try{
    const billets = await apiFetch(`/billets/event/${currentEventId}`);
    const total = await apiFetch(`/billets/event/${currentEventId}/total`).catch(()=>({total:0}));
    $('#billetsTableBody').innerHTML = billets.map(b=>`
      <tr><td>${b.nom} ${b.prenom} (${b.type})</td><td>${b.compagnie||''} ${b.num_vol_aller||''} ${b.aeroport_depart||''}→${b.aeroport_arrivee||''}</td><td>${b.date_depart||''} / ${b.date_retour||''}</td><td>${b.prix} DA<br><span class="badge bg-info">${b.statut}</span></td></tr>
    `).join('');
    $('#billetsTotal').textContent = `Total: ${total.total||0} DA pour ${total.count||0} billets`;
  }catch{}
}

// Reservations
async function loadReservations(){
  if(!currentEventId) return;
  try{
    const resvs = await apiFetch(`/reservations/event/${currentEventId}`);
    $('#reservationsTableBody').innerHTML = resvs.map(r=>`
      <tr><td>${r.hotel_nom} (${r.wilaya_nom})<br>Ch ${r.numero_chambre||''} ${r.type_chambre} cap ${r.capacite_max}</td><td>${r.date_arrivee||''} → ${r.date_depart||''}<br>${r.nb_nuits} nuits x ${r.prix_nuit} = ${r.prix_nuit*r.nb_nuits} DA</td><td>${r.nb_occupants}/${r.capacite_max} occupants</td><td><span class="badge bg-${r.statut==='confirmee'?'success':'warning'}">${r.statut}</span></td></tr>
    `).join('');
  }catch{}
}

async function loadHotelAlerts(){
  if(!currentEventId) return;
  try{
    const alerts = await apiFetch(`/reservations/event/${currentEventId}/alerts`);
    const container = $('#hotelAlerts');
    if(!container) return;
    if(!alerts.length) container.innerHTML='<div class="text-muted">Aucune alerte</div>';
    else container.innerHTML = alerts.map(a=>`
      <div class="alert alert-warning alert-hotel"><i class="bi bi-exclamation-triangle"></i> ${a.message}<br><small>${new Date(a.created_at).toLocaleString()}</small></div>
    `).join('');
  }catch{}
}

async function loadNotifications(){
  if(!currentEventId) return;
  try{
    const notifs = await apiFetch(`/notifications/event/${currentEventId}`);
    $('#notificationsList').innerHTML = notifs.map(n=>`
      <div class="mb-2 p-2 border rounded bg-white"><small class="text-muted">${new Date(n.created_at).toLocaleString()}</small><br><b>${n.titre||n.type}</b>: ${n.message}</div>
    `).join('') || '<div class="text-muted">Aucune notification</div>';
  }catch{}
}

// Audit - libellés d'action lisibles
const AUDIT_VERBS = { POST:'Ajouter', PUT:'Modifier', PATCH:'Modifier', DELETE:'Supprimer' };
const AUDIT_TABLES = {
  events:'événement', rubriques:'catégorie', hotels:'hôtel', personnes:'participant',
  exposants:'exposant', stands:'stand', employes:'employé', sponsors:'sponsor',
  restauration:'restauration', conventions:'convention', billets:'billet',
  reservations:'réservation hôtel', programmes:'créneau', notifications:'notification',
  wilayas:'wilaya', auth:'compte utilisateur'
};
function friendlyAction(action, table){
  const method = String(action||'').split(' ')[0].split('/')[0].toUpperCase();
  const verb = AUDIT_VERBS[method] || 'Action';
  const noun = AUDIT_TABLES[String(table||'').toLowerCase()] || table || String(action||'').split('/')[1] || '';
  return (verb+' '+noun).trim();
}

async function loadAudit(){
  try{
    const logs = await apiFetch(`/audit-logs?limit=100`);
    $('#auditTableBody').innerHTML = logs.map(l=>`
      <tr><td>${new Date(l.created_at).toLocaleString()}</td><td>${l.username||l.user_id||'—'}</td><td><span class="badge bg-soft-primary">${friendlyAction(l.action, l.table_name)}</span></td></tr>
    `).join('');
  }catch{}
}

// Users & Permissions
const PERM_MODULES = [
  { k:'dashboard',      label:'Dashboard',        icon:'bi-speedometer2' },
  { k:'events',         label:'Événements',       icon:'bi-calendar2-week' },
  { k:'hotels',         label:'Wilayas & Hôtels', icon:'bi-building' },
  { k:'stands',         label:'Stands & Plan',    icon:'bi-map' },
  { k:'personnes',      label:'Participants',     icon:'bi-people' },
  { k:'exposants',      label:'Exposants',        icon:'bi-shop' },
  { k:'employes',       label:'Employés',         icon:'bi-person-badge' },
  { k:'sponsors',       label:'Sponsors',         icon:'bi-award' },
  { k:'restauration',   label:'Restauration',     icon:'bi-cup-hot' },
  { k:'conventions',    label:'Conventions',      icon:'bi-file-earmark-text' },
  { k:'billets',        label:'Billets Avion',    icon:'bi-airplane' },
  { k:'reservations',   label:'Réservations Hôtel', icon:'bi-door-closed' },
  { k:'programmes',     label:'Programme',        icon:'bi-journal-text' },
  { k:'notifications',  label:'Notifications',    icon:'bi-bell' },
  { k:'audit',          label:'Journal Audit',    icon:'bi-clock-history' },
  { k:'users',          label:'Utilisateurs',     icon:'bi-person-gear' },
  { k:'finance',        label:'Finance',          icon:'bi-wallet2' }
];
const ROLE_LABELS = { super_admin:'Super Admin', admin:'Admin', manager:'Manager', finance:'Finance', viewer:'Lecture seule' };

function renderPermGrid(){
  const grid = $('#permGrid'); if(!grid) return;
  grid.innerHTML = PERM_MODULES.map(m=>`
    <div class="col-6 col-md-3">
      <label class="perm-chip">
        <input type="checkbox" class="perm-check" value="${m.k}">
        <span class="perm-chip-box"><i class="bi ${m.icon}"></i> ${m.label}</span>
      </label>
    </div>
  `).join('');
}
function checkPerms(perms){
  const p = perms || {};
  const all = !!(p.all);
  document.querySelectorAll('#permGrid .perm-check').forEach(c=>{
    c.checked = all || !!p[c.value];
  });
}
function toggleAllPerms(){
  const checks = [...document.querySelectorAll('#permGrid .perm-check')];
  const allOn = checks.every(c=>c.checked);
  checks.forEach(c=>c.checked = !allOn);
}
function collectedPerms(){
  const perms = {};
  document.querySelectorAll('#permGrid .perm-check').forEach(c=>{ if(c.checked) perms[c.value]=true; });
  if(Object.keys(perms).length === PERM_MODULES.length) perms.all = true;
  return perms;
}

async function loadUsers(){
  try{
    const users = await apiFetch('/auth/users');
    $('#usersTableBody').innerHTML = users.map(u=>{
      const perms = u.permissions;
      let permLabel = '<span class="badge bg-soft-info">Aucune</span>';
      // super_admin & admin ont toujours tous les privilèges
      if(isPrivilegedRole(u.role)){
        permLabel = '<span class="badge bg-soft-success">Tout accès</span>';
      } else if(perms){
        const keys = Array.isArray(perms)?perms:Object.keys(perms).filter(k=>perms[k] && k!=='all');
        if(perms.all || keys.length>=PERM_MODULES.length) permLabel = '<span class="badge bg-soft-success">Tout accès</span>';
        else if(keys.length) permLabel = keys.slice(0,4).map(k=>`<span class="badge bg-soft-primary me-1">${k}</span>`).join('')+(keys.length>4?`<span class="badge bg-soft-secondary">+${keys.length-4}</span>`:'');
      }
      const canEdit = canManageUsers();
      return `<tr>
        <td><b>${u.username}</b></td><td>${u.email||'—'}</td>
        <td><span class="badge ${u.role==='super_admin'?'bg-soft-warning':u.role==='admin'?'bg-soft-primary':u.role==='viewer'?'bg-soft-secondary':'bg-soft-info'}">${ROLE_LABELS[u.role]||u.role}</span></td>
        <td>${permLabel}</td>
        <td><span class="badge ${u.is_active?'bg-soft-success':'bg-soft-danger'}">${u.is_active?'Actif':'Désactivé'}</span></td>
        <td>${canEdit?`
          <button class="btn btn-sm btn-outline-secondary" onclick="editUser(${parseInt(u.id)})"><i class="bi bi-pencil"></i></button>
          ${currentUser?.role==='super_admin'?`<button class="btn btn-sm btn-outline-danger" onclick="deleteUser(${parseInt(u.id)})"><i class="bi bi-trash"></i></button>`:''}
        `:'—'}</td>
      </tr>`;
    }).join('');
  }catch(e){ console.error(e); }
}

function resetUserModal(){
  $('#formUser').reset();
  $('#userEditId').value='';
  $('#modalUserTitle').textContent='Nouvel Utilisateur';
  $('#userSubmitBtn').textContent='Créer Utilisateur';
  $('#userPassword').removeAttribute('required');
  $('#userPassword').placeholder='Mot de passe';
  checkPerms({});
}
function openUserModal(){
  resetUserModal();
  bootstrap.Modal.getOrCreateInstance($('#modalUser')).show();
}
function editUser(id){
  apiFetch('/auth/users').then(users=>{
    const u = users.find(x=>parseInt(x.id)===parseInt(id));
    if(!u) return;
    $('#userEditId').value=u.id;
    $('#userUsername').value=u.username;
    $('#userEmail').value=u.email;
    $('#userPassword').value='';
    $('#userPassword').placeholder='Laisser vide pour ne pas changer';
    $('#userRoleSelect').value=u.role;
    $('#userActive').checked=!!u.is_active;
    $('#modalUserTitle').textContent='Modifier '+u.username;
    $('#userSubmitBtn').textContent='Enregistrer';
    // super_admin & admin ont toujours tous les privilèges
    checkPerms(isPrivilegedRole(u.role) ? { all:true } : u.permissions);
    bootstrap.Modal.getOrCreateInstance($('#modalUser')).show();
  }).catch(e=>toast(e.message,'danger'));
}
function deleteUser(id){
  if(!confirm('Supprimer cet utilisateur ?')) return;
  apiFetch('/auth/users/'+id,{method:'DELETE'}).then(()=>{ toast('Utilisateur supprimé'); loadUsers(); }).catch(e=>toast(e.message,'danger'));
}
async function submitUser(e){
  e.preventDefault();
  const id = $('#userEditId').value;
  const password = $('#userPassword').value;
  if(!id && !password){ toast('Mot de passe requis','danger'); return; }
  const role = $('#userRoleSelect').value;
  // super_admin & admin reçoivent toujours tous les privilèges
  let permissions = collectedPerms();
  if(isPrivilegedRole(role)) permissions = { all:true };
  const base = { role, permissions, is_active: $('#userActive').checked };
  try{
    if(id){
      await apiFetch('/auth/users/'+id,{method:'PUT', body:base});
      toast('Utilisateur mis à jour');
    } else {
      await apiFetch('/auth/register',{method:'POST', body:{ username:$('#userUsername').value, email:$('#userEmail').value, password, ...base }});
      toast('Utilisateur créé');
    }
    bootstrap.Modal.getInstance($('#modalUser')).hide();
    loadUsers();
  }catch(err){ toast(err.message,'danger'); }
}

// Topbar user dropdown
function toggleUserMenu(){
  const menu = $('#userMenu');
  if(menu) menu.classList.toggle('show');
}

// CRUD helpers
const SECTION_META = {
  dashboard:   { t:'Dashboard Finance'},
  events:      { t:'Accueil · Mes Événements'},
  hotels:      { t:'Wilayas & Hôtels'},
  stands:      { t:'Stands & Plan'},
  personnes:   { t:'Participants'},
  exposants:   { t:'Exposants'},
  employes:    { t:'Employés & Équipe'},
  sponsors:    { t:'Sponsors'},
  restauration:{ t:'Restauration'},
  conventions: { t:'Conventions'},
  billets:     { t:'Billets d\'Avion'},
  reservations:{ t:'Réservations Hôtel'},
  programmes:  { t:'Programme'},
  users:       { t:'Utilisateurs & Permissions'},
  audit:       { t:'Journal d\'Audit'}
};
function showSection(id){
  if(id==='users' && !canManageUsers()){
    toast('Accès réservé aux administrateurs','danger');
    return;
  }
  // Mode accueil : sidebar masquée tant qu'aucun événement n'est entré
  const wrapper = $('#appWrapper');
  if(wrapper) wrapper.classList.toggle('home-mode', id==='events');
  $$('.content-section').forEach(s=>s.classList.add('d-none'));
  $('#section-'+id).classList.remove('d-none');
  $$('.sidebar .nav-link').forEach(l=>l.classList.remove('active'));
  const active = $(`.sidebar .nav-link[data-section="${id}"]`);
  if(active) active.classList.add('active');
  const meta = SECTION_META[id];
  if(meta){
    const pt = $('#pageTitle'); if(pt) pt.textContent = meta.t;
    const ps = $('#pageSubtitle'); if(ps) ps.textContent = meta.s;
  }
  if(id==='users') loadUsers();
  if(id==='events') loadHomeEvents();
  if(window.innerWidth<992) $('.sidebar').classList.remove('show');
}
// Global search on the visible table
document.addEventListener('DOMContentLoaded', ()=>{
  const gs = document.getElementById('globalSearch');
  if(gs){
    gs.addEventListener('input', ()=>{
      const q = gs.value.trim().toLowerCase();
      if(!q){ document.querySelectorAll('.content-section table tbody tr').forEach(r=>r.style.display=''); return; }
      document.querySelectorAll('.content-section table tbody tr').forEach(r=>{
        r.style.display = r.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  }
});

// Forms
function resetEventModal(){
  const f = $('#modalEvent form');
  if(f) f.reset();
  editingEventId = null;
  const hs = $('#eventHotelSelect'); if(hs) hs.innerHTML = '<option value="">-- Choisir hôtel --</option>';
  const t = $('#modalEvent .modal-title'); if(t) t.textContent = 'Nouvel Événement';
  const b = $('#modalEvent button[type="submit"]'); if(b) b.textContent = 'Créer';
}
function openCreateEventModal(){
  resetEventModal();
}
async function editEvent(id){
  const ev = eventsCache.find(x=>String(x.id)===String(id));
  if(!ev){ toast('Événement introuvable','danger'); return; }
  editingEventId = ev.id;
  const f = $('#modalEvent form');
  f.elements['titre'].value = ev.titre||'';
  f.elements['theme'].value = ev.theme||'';
  f.elements['description'].value = ev.description||'';
  f.elements['date_debut'].value = (ev.date_debut||'').slice(0,10);
  f.elements['date_fin'].value = (ev.date_fin||'').slice(0,10);
  f.elements['budget_initial'].value = ev.budget_initial||0;
  f.elements['nb_personnes_prevu'].value = ev.nb_personnes_prevu||'';
  f.elements['nb_invites'].value = ev.nb_invites||'';
  f.elements['nb_exposants_prevu'].value = ev.nb_exposants_prevu||'';
  f.elements['nb_vip_prevu'].value = ev.nb_vip_prevu||'';
  f.elements['statut'].value = ev.statut||'brouillon';
  const ws = $('#eventWilayaSelect'); if(ws) ws.value = ev.wilaya_id||'';
  // charge les hôtels de la wilaya puis présélectionne l'hôtel de l'événement
  if(ws){
    await loadEventHotels(ev.wilaya_id, ev.emplacement);
  } else {
    const hs = $('#eventHotelSelect'); if(hs) hs.value = ev.emplacement||'';
  }
  const t = $('#modalEvent .modal-title'); if(t) t.textContent = 'Modifier Événement';
  const b = $('#modalEvent button[type="submit"]'); if(b) b.textContent = 'Enregistrer';
  bootstrap.Modal.getOrCreateInstance($('#modalEvent')).show();
}
async function saveEvent(e){
  e.preventDefault();
  const fd = new FormData(e.target);
  const payload = Object.fromEntries(fd.entries());
  try{
    if(editingEventId){
      await apiFetch('/events/'+editingEventId,{method:'PUT', body:payload});
      toast('Événement mis à jour');
    } else {
      const data = await apiFetch('/events',{method:'POST', body:payload});
      // Sélectionne automatiquement le nouvel événement
      currentEventId = data.id;
      localStorage.setItem('currentEventId', data.id);
      toast('Événement créé #'+data.id);
    }
    e.target.reset();
    editingEventId = null;
    bootstrap.Modal.getInstance($('#modalEvent'))?.hide();
    await loadEvents();
    // Rafraîchit la grille d'accueil pour que le nouvel événement apparaisse
    loadHomeEvents();
    if(currentEventId){
      const sel = $('#eventSelector'); if(sel) sel.value = String(currentEventId);
      const tsel = $('#topbarEventSelector'); if(tsel) tsel.value = String(currentEventId);
    }
    refreshDashboard();
    showSection('events');
  }catch(err){ toast(err.message,'danger'); }
  return false;
}
function setHotelModalMode(mode){
  const t = $('#modalHotelTitle'); if(t) t.textContent = mode==='edit' ? 'Modifier Hôtel' : 'Ajouter Hôtel';
  const b = $('#modalHotelSaveBtn'); if(b) b.textContent = mode==='edit' ? 'Enregistrer' : 'Créer';
}

async function editHotel(id){
  editingHotelId = id;
  setHotelModalMode('edit');
  const form = $('#modalHotel form');
  form.reset();
  try{
    const hotel = await apiFetch('/hotels/'+id);
    // Remplit le sélecteur de wilaya si nécessaire, puis sélectionne celle de l'hôtel
    const wsel = form.querySelector('[name=wilaya_id]');
    if(wsel && wsel.options.length<=1 && wilayasCache.length){
      wsel.innerHTML='<option value="">-- Choisir Wilaya --</option>'+wilayasCache.map(w=>`<option value="${w.id}">${w.code} - ${w.nom}</option>`).join('');
    }
    const set=(n,v)=>{ const el=form.querySelector(`[name=${n}]`); if(el) el.value = (v===null||v===undefined)?'':v; };
    set('nom', hotel.nom);
    set('wilaya_id', hotel.wilaya_id);
    set('etoiles', hotel.etoiles);
    set('adresse', hotel.adresse);
    set('telephone', hotel.telephone);
    set('email', hotel.email);
    set('capacite', hotel.capacite);
    set('prix_moyen', hotel.prix_moyen);
    set('contact_reservation', hotel.contact_reservation);
    set('notes', hotel.notes);
    bootstrap.Modal.getOrCreateInstance($('#modalHotel')).show();
  }catch(err){ toast(err.message||'Erreur de chargement','danger'); }
}

async function saveHotel(e){
  e.preventDefault();
  const payload = Object.fromEntries(new FormData(e.target).entries());
  try{
    if(editingHotelId){
      await apiFetch('/hotels/'+editingHotelId,{method:'PUT', body:payload});
      toast('Hôtel modifié');
    }else{
      await apiFetch('/hotels',{method:'POST', body:payload});
      toast('Hôtel créé');
    }
    e.target.reset();
    editingHotelId = null;
    setHotelModalMode('create');
    bootstrap.Modal.getInstance($('#modalHotel')).hide();
    loadHotels();
  }catch(err){ toast(err.message,'danger'); }
}
function setPersonneModalMode(mode){
  const t=$('#modalPersonneTitle'); if(t) t.textContent = mode==='edit' ? 'Modifier Participant' : 'Ajouter Participant';
  const b=$('#modalPersonneBtn'); if(b) b.textContent = mode==='edit' ? 'Enregistrer' : 'Ajouter';
}
async function editPersonne(id){
  try{
    const list = await apiFetch(`/personnes/event/${currentEventId}`);
    const p = list.find(x=>String(x.id)===String(id));
    if(!p) return;
    editingPersonneId = id;
    setPersonneModalMode('edit');
    const form = $('#modalPersonne form'); form.reset();
    const set=(n,v)=>{const el=form.querySelector(`[name=${n}]`); if(el) el.value=(v==null)?'':v;};
    set('type',p.type); set('nom',p.nom); set('prenom',p.prenom); set('email',p.email); set('telephone',p.telephone);
    set('entreprise',p.entreprise); set('poste',p.poste); set('wilaya_id',p.wilaya_id); set('pays',p.pays); set('notes',p.notes);
    bootstrap.Modal.getOrCreateInstance($('#modalPersonne')).show();
  }catch(err){ toast(err.message||'Erreur de chargement','danger'); }
}
async function createPersonne(e){
  e.preventDefault();
  const fd = new FormData(e.target);
  const payload = Object.fromEntries(fd.entries());
  try{
    if(editingPersonneId){
      await apiFetch('/personnes/'+editingPersonneId,{method:'PUT', body:payload});
      toast('Participant modifié');
    }else{
      payload.event_id = currentEventId;
      await apiFetch('/personnes',{method:'POST', body:payload});
      toast('Personne ajoutée');
    }
    e.target.reset();
    editingPersonneId = null;
    setPersonneModalMode('create');
    bootstrap.Modal.getInstance($('#modalPersonne')).hide();
    loadPersonnes();
  }catch(err){ toast(err.message,'danger'); }
}
function setExposantModalMode(mode){
  const t=$('#modalExposantTitle'); if(t) t.textContent = mode==='edit' ? 'Modifier Exposant' : 'Ajouter Exposant';
  const b=$('#modalExposantBtn'); if(b) b.textContent = mode==='edit' ? 'Enregistrer' : 'Créer Exposant + Stand Auto';
}
async function editExposant(id){
  try{
    const list = await apiFetch(`/exposants/event/${currentEventId}`);
    const ex = list.find(x=>String(x.id)===String(id));
    if(!ex) return;
    editingExposantId = id;
    editingExposantPersonneId = ex.personne_id;
    setExposantModalMode('edit');
    const form = $('#modalExposant form'); form.reset();
    const set=(n,v)=>{const el=form.querySelector(`[name=${n}]`); if(el) el.value=(v==null)?'':v;};
    set('nom',ex.nom); set('prenom',ex.prenom); set('email',ex.email); set('telephone',ex.telephone);
    set('entreprise',ex.entreprise); set('poste',ex.poste); set('wilaya_id',ex.wilaya_id);
    set('domaine_activite',ex.domaine_activite); set('convoque_par',ex.convoque_par); set('fiche_technique',ex.fiche_technique);
    set('superficie_demandee',ex.superficie_demandee); set('methode_paiement',ex.methode_paiement); set('montant_paye',ex.montant_paye);
    set('besoins_speciaux',ex.besoins_speciaux);
    const ap = form.querySelector('[name=a_paye]'); if(ap) ap.checked = !!ex.a_paye;
    bootstrap.Modal.getOrCreateInstance($('#modalExposant')).show();
  }catch(err){ toast(err.message||'Erreur de chargement','danger'); }
}
async function createExposant(e){
  e.preventDefault();
  const fd = new FormData(e.target);
  const personne_data = {
    nom: fd.get('nom'), prenom: fd.get('prenom'), email: fd.get('email'), telephone: fd.get('telephone'), entreprise: fd.get('entreprise'), poste: fd.get('poste'), wilaya_id: fd.get('wilaya_id')
  };
  const exposant_data = {
    fiche_technique: fd.get('fiche_technique'),
    convoque_par: fd.get('convoque_par'),
    domaine_activite: fd.get('domaine_activite'),
    superficie_demandee: fd.get('superficie_demandee'),
    a_paye: fd.get('a_paye')==='on' || fd.get('a_paye')==='1',
    methode_paiement: fd.get('methode_paiement'),
    montant_paye: fd.get('montant_paye'),
    besoins_speciaux: fd.get('besoins_speciaux')
  };
  try{
    if(editingExposantId){
      if(editingExposantPersonneId){
        await apiFetch('/personnes/'+editingExposantPersonneId,{method:'PUT', body:{...personne_data, type:'exposant'}});
      }
      await apiFetch('/exposants/'+editingExposantId,{method:'PUT', body:exposant_data});
      toast('Exposant modifié');
    }else{
      await apiFetch('/exposants',{method:'POST', body:{ event_id: currentEventId, personne_data, ...exposant_data }});
      toast('Exposant créé + stand auto');
    }
    e.target.reset();
    editingExposantId = null; editingExposantPersonneId = null;
    setExposantModalMode('create');
    bootstrap.Modal.getInstance($('#modalExposant')).hide();
    loadExposants(); loadStandsPlan(); loadPersonnes();
  }catch(err){ toast(err.message,'danger'); }
}
function setEmployeModalMode(mode){
  const t=$('#modalEmployeTitle'); if(t) t.textContent = mode==='edit' ? 'Modifier Employé' : 'Ajouter Employé / Équipe';
  const b=$('#modalEmployeBtn'); if(b) b.textContent = mode==='edit' ? 'Enregistrer' : 'Ajouter';
}
async function editEmploye(id){
  try{
    const list = await apiFetch(`/employes/event/${currentEventId}`);
    const e = list.find(x=>String(x.id)===String(id));
    if(!e) return;
    editingEmployeId = id;
    setEmployeModalMode('edit');
    const form = $('#modalEmploye form'); form.reset();
    const set=(n,v)=>{const el=form.querySelector(`[name=${n}]`); if(el) el.value=(v==null)?'':v;};
    set('nom',e.nom); set('prenom',e.prenom); set('poste',e.poste); set('poste_custom',e.poste_custom);
    set('tache',e.tache); set('lieu_affectation',e.lieu_affectation); set('telephone',e.telephone); set('email',e.email);
    set('salaire_jour',e.salaire_jour); set('nb_jours',e.nb_jours); set('statut_paiement',e.statut_paiement);
    bootstrap.Modal.getOrCreateInstance($('#modalEmploye')).show();
  }catch(err){ toast(err.message||'Erreur de chargement','danger'); }
}
async function createEmploye(e){
  e.preventDefault();
  const payload = Object.fromEntries(new FormData(e.target).entries());
  try{
    if(editingEmployeId){
      await apiFetch('/employes/'+editingEmployeId,{method:'PUT', body:payload});
      toast('Employé modifié');
    }else{
      payload.event_id=currentEventId;
      await apiFetch('/employes',{method:'POST', body:payload});
      toast('Employé ajouté');
    }
    e.target.reset();
    editingEmployeId = null;
    setEmployeModalMode('create');
    bootstrap.Modal.getInstance($('#modalEmploye')).hide();
    loadEmployes();
  }catch(err){ toast(err.message,'danger'); }
}
async function generateStands(){
  const rows = parseInt($('#genRows').value)||5;
  const cols = parseInt($('#genCols').value)||8;
  try{ const r= await apiFetch(`/stands/event/${currentEventId}/generate`,{method:'POST', body:{rows,cols}}); toast(r.message); loadStandsPlan(); }catch(err){ toast(err.message,'danger'); }
}
function deleteEvent(id){
  if(!confirm('Supprimer événement?')) return;
  apiFetch('/events/'+id,{method:'DELETE'}).then(async ()=>{
    toast('Événement supprimé');
    if(String(currentEventId)===String(id)){
      currentEventId = null;
      localStorage.removeItem('currentEventId');
    }
    await loadEvents();
    loadHomeEvents();
    refreshDashboard();
  });
}
function deleteHotel(id){ if(confirm('Supprimer hôtel?')) apiFetch('/hotels/'+id,{method:'DELETE'}).then(()=>{loadHotels();}); }
function deletePersonne(id){ if(confirm('Supprimer?')) apiFetch('/personnes/'+id,{method:'DELETE'}).then(()=>{loadPersonnes();}); }
function deleteExposant(id){ if(confirm('Supprimer exposant?')) apiFetch('/exposants/'+id,{method:'DELETE'}).then(()=>{toast('Exposant supprimé'); loadExposants(); loadStandsPlan(); loadPersonnes();}); }
function deleteEmploye(id){ if(confirm('Supprimer employé?')) apiFetch('/employes/'+id,{method:'DELETE'}).then(()=>{toast('Employé supprimé'); loadEmployes();}); }
function deleteSponsor(id){ if(confirm('Supprimer sponsor?')) apiFetch('/sponsors/'+id,{method:'DELETE'}).then(()=>{toast('Sponsor supprimé'); loadSponsors();}); }

// on load
document.addEventListener('DOMContentLoaded',()=>{
  renderPermGrid();
  // Boutons "Nouvel Événement" → repartent en mode création
  document.querySelectorAll('[data-bs-target="#modalEvent"]').forEach(btn=>{
    btn.addEventListener('click', ()=>openCreateEventModal());
  });
  $('#formUser')?.addEventListener('submit', submitUser);
  $('#userRoleSelect')?.addEventListener('change',(e)=>{
    // super_admin & admin → tous les privilèges automatiquement
    if(isPrivilegedRole(e.target.value)) checkPerms({ all:true });
  });
  $('#userChip')?.addEventListener('click', toggleUserMenu);
  document.addEventListener('click',(e)=>{
    const chip = $('#userChip');
    if(chip && !chip.contains(e.target)){
      const menu = $('#userMenu'); if(menu) menu.classList.remove('show');
    }
  });
  if(token) initApp();
  $('#loginForm')?.addEventListener('submit',(e)=>{ e.preventDefault(); login(); });
  $('#togglePwdIcon')?.closest('.toggle-pwd')?.addEventListener('keydown',(e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); togglePassword(); }});
  $('#eventSelector')?.addEventListener('change',(e)=>{ if(e.target.value){ selectEvent(e.target.value); }});
  $('#topbarEventSelector')?.addEventListener('change',(e)=>{ if(e.target.value){ selectEvent(e.target.value); }});
  $('#filterHotelWilaya')?.addEventListener('change', onWilayaChangeForHotels);
  // Wilaya du formulaire événement → charge la liste des hôtels adéquats
  $('#eventWilayaSelect')?.addEventListener('change',(e)=>{
    loadEventHotels(e.target.value, null);
  });
});

function toggleSidebar(){ $('.sidebar').classList.toggle('show'); }

// Additional handlers for remaining modals
document.addEventListener('DOMContentLoaded', ()=>{
  // Sponsor form (multipart)
  const formSponsor = document.getElementById('formSponsor');
  if(formSponsor){
    formSponsor.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const fd = new FormData(e.target);
      const url = editingSponsorId ? (API+'/sponsors/'+editingSponsorId) : (API+'/sponsors');
      const method = editingSponsorId ? 'PUT' : 'POST';
      if(!editingSponsorId) fd.append('event_id', currentEventId);
      try{
        const res = await fetch(url,{method, headers:{'Authorization':'Bearer '+token}, body: fd});
        const data = await res.json();
        if(!res.ok) throw new Error(data.error);
        toast(editingSponsorId ? 'Sponsor modifié' : 'Sponsor ajouté');
        bootstrap.Modal.getInstance(document.getElementById('modalSponsor')).hide();
        e.target.reset();
        editingSponsorId = null;
        setSponsorModalMode('create');
        loadSponsors();
      }catch(err){ toast(err.message,'danger'); }
    });
  }
  // Menu form
  const formMenu = document.getElementById('formMenu');
  if(formMenu){
    formMenu.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const payload = Object.fromEntries(new FormData(e.target).entries());
      payload.event_id = currentEventId;
      try{
        await apiFetch('/restauration/menus',{method:'POST', body:payload});
        toast('Menu créé');
        bootstrap.Modal.getInstance(document.getElementById('modalMenu')).hide();
        e.target.reset();
        loadRestauration();
      }catch(err){ toast(err.message,'danger'); }
    });
  }
  // Affectation
  const formAffect = document.getElementById('formAffect');
  if(formAffect){
    formAffect.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const payload = Object.fromEntries(new FormData(e.target).entries());
      payload.event_id = currentEventId;
      // need menu list for select? Populate dynamically when modal opens
      try{
        await apiFetch('/restauration/affectations',{method:'POST', body:payload});
        toast('Affectation créée (VIP auto détecté)');
        bootstrap.Modal.getInstance(document.getElementById('modalRestaurationAffect')).hide();
        loadRestauration();
      }catch(err){ toast(err.message,'danger'); }
    });
    // populate menus select when modal shown
    document.getElementById('modalRestaurationAffect')?.addEventListener('show.bs.modal', async ()=>{
      if(!currentEventId) return;
      const menus = await apiFetch(`/restauration/event/${currentEventId}/menus`).catch(()=>[]);
      const sel = document.getElementById('selectMenuResto');
      if(sel) sel.innerHTML = '<option value="">-- Menu --</option>' + menus.map(m=>`<option value="${m.id}">${m.nom_menu} (${m.type_repas}) ${m.prix_par_personne} DA</option>`).join('');
    });
  }

  // Convention
  const formConv = document.getElementById('formConvention');
  if(formConv){
    formConv.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const fd = new FormData(e.target);
      fd.append('event_id', currentEventId);
      try{
        const res = await fetch(API+'/conventions',{method:'POST', headers:{'Authorization':'Bearer '+token}, body: fd});
        const data = await res.json();
        if(!res.ok) throw new Error(data.error);
        toast('Convention ajoutée');
        bootstrap.Modal.getInstance(document.getElementById('modalConvention')).hide();
        e.target.reset();
        loadConventions();
      }catch(err){ toast(err.message,'danger'); }
    });
  }
  // Billet
  const formBillet = document.getElementById('formBillet');
  if(formBillet){
    formBillet.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const fd = new FormData(e.target);
      fd.append('event_id', currentEventId);
      try{
        const res = await fetch(API+'/billets',{method:'POST', headers:{'Authorization':'Bearer '+token}, body: fd});
        const data= await res.json();
        if(!res.ok) throw new Error(data.error);
        toast('Billet enregistré - total mis à jour');
        bootstrap.Modal.getInstance(document.getElementById('modalBillet')).hide();
        e.target.reset();
        loadBillets();
      }catch(err){ toast(err.message,'danger'); }
    });
  }
  // Reservation
  const formRes = document.getElementById('formReservation');
  if(formRes){
    formRes.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const fd = new FormData(e.target);
      const occupantSelect = document.getElementById('reservationOccupantsSelect');
      const occupant_ids = occupantSelect ? Array.from(occupantSelect.selectedOptions).map(o=>parseInt(o.value)).filter(Boolean) : [];
      const payload = Object.fromEntries(fd.entries());
      payload.event_id = currentEventId;
      payload.occupant_ids = occupant_ids;
      // ensure numbers
      payload.prix_nuit = parseFloat(payload.prix_nuit)||0;
      payload.nb_nuits = parseInt(payload.nb_nuits)||1;
      payload.capacite_max = parseInt(payload.capacite_max)||1;
      try{
        await apiFetch('/reservations',{method:'POST', body:payload});
        toast('Réservation créée');
        bootstrap.Modal.getInstance(document.getElementById('modalReservation')).hide();
        e.target.reset();
        loadReservations();
        loadHotelAlerts();
      }catch(err){ toast(err.message,'danger'); }
    });
  }
});

// Extend loadRestauration to also update dashboard finance after
const originalLoadRestauration = loadRestauration;

