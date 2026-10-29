import express from 'express';
import pool from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
const router = express.Router();
const privileged = (role) => ['superadmin','admin'].includes(String(role||'').toLowerCase().replace(/[^a-z]/g,''));
const can = (req, ...keys) => privileged(req.user.role) || req.user.permissions?.all || keys.some(k => req.user.permissions?.[k] || (k==='equipe' && req.user.permissions?.employes));

router.get('/', authenticate, async (req,res) => {
  const q=String(req.query.q||'').trim(); if(!q.length) return res.json([]);
  const like='%'+q+'%'; const eventId=req.query.event_id ? Number(req.query.event_id) : null; const results=[];
  const eventClause=eventId ? ' AND x.event_id=?' : ''; const eventParams=eventId ? [eventId] : [];
  if(can(req,'personnes','exposants','billets','reservations')){
    const [rows]=await pool.query(`SELECT x.id,x.event_id,x.nom,x.prenom,x.email,x.telephone,x.type,x.entreprise,e.titre AS event_titre FROM personnes x JOIN events e ON e.id=x.event_id WHERE (x.nom LIKE ? OR x.prenom LIKE ? OR CONCAT(x.nom,' ',x.prenom) LIKE ? OR CONCAT(x.prenom,' ',x.nom) LIKE ? OR x.email LIKE ?)${eventClause} ORDER BY x.nom,x.prenom`,[like,like,like,like,like,...eventParams]);
    rows.forEach(r=>results.push({...r,result_type:r.type==='exposant'?'Exposant':'Participant',source:'personnes'}));
  }
  if(can(req,'equipe')){
    const [rows]=await pool.query(`SELECT x.id,x.event_id,x.nom,x.prenom,x.email,x.telephone,COALESCE(c.nom,x.poste) AS categorie_nom,x.responsable,e.titre AS event_titre FROM employes x JOIN events e ON e.id=x.event_id LEFT JOIN equipe_categories c ON c.id=x.categorie_id WHERE (x.nom LIKE ? OR x.prenom LIKE ? OR CONCAT(x.nom,' ',x.prenom) LIKE ? OR CONCAT(x.prenom,' ',x.nom) LIKE ? OR x.email LIKE ?)${eventClause} ORDER BY x.nom,x.prenom`,[like,like,like,like,like,...eventParams]);
    rows.forEach(r=>results.push({...r,result_type:r.categorie_nom||'Équipe',source:'equipe'}));
  }
  if(can(req,'intervenants','programmes')){
    const [rows]=await pool.query(`SELECT x.id,x.event_id,x.nom,x.prenom,x.email,x.telephone,x.poste,e.titre AS event_titre FROM intervenants x JOIN events e ON e.id=x.event_id WHERE (x.nom LIKE ? OR x.prenom LIKE ? OR CONCAT(x.nom,' ',x.prenom) LIKE ? OR CONCAT(x.prenom,' ',x.nom) LIKE ? OR x.email LIKE ?)${eventClause} ORDER BY x.nom,x.prenom`,[like,like,like,like,like,...eventParams]);
    rows.forEach(r=>results.push({...r,result_type:'Intervenant',source:'intervenants'}));
  }
  res.json(results.sort((a,b)=>(a.nom+' '+a.prenom).localeCompare(b.nom+' '+b.prenom,'fr')));
});
router.get('/:source/:id', authenticate, async(req,res)=>{
  const sources={personnes:{table:'personnes',keys:['personnes','exposants','billets','reservations']},equipe:{table:'employes',keys:['equipe']},intervenants:{table:'intervenants',keys:['intervenants','programmes']}};
  const cfg=sources[req.params.source];
  if(!cfg) return res.status(404).json({error:'Type de profil inconnu'});
  if(!can(req,...cfg.keys)) return res.status(403).json({error:'Rubrique non autorisée'});
  const [[row]]=await pool.query(`SELECT x.*, e.titre AS event_titre FROM ${cfg.table} x JOIN events e ON e.id=x.event_id WHERE x.id=?`,[req.params.id]);
  if(!row) return res.status(404).json({error:'Profil introuvable'});
  if(req.params.source==='equipe' && row.categorie_id){
    const [[cat]]=await pool.query('SELECT nom FROM equipe_categories WHERE id=?',[row.categorie_id]);row.categorie_nom=cat?.nom;
  }
  if(req.params.source==='personnes' && row.type==='exposant' && can(req,'exposants')){const [[ex]]=await pool.query('SELECT id FROM exposants WHERE personne_id=?',[row.id]);row.exposant_id=ex?.id||null;}
  res.json(row);
});
export default router;
