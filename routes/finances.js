import express from 'express';
import pool from '../config/db.js';
import { authenticate, requireRead, requireWrite } from '../middleware/auth.js';
const router = express.Router();

const num = (v) => Number.parseFloat(v || 0) || 0;

async function automaticSummary(eventId) {
  const [[event]] = await pool.query('SELECT budget_initial FROM events WHERE id=?', [eventId]);
  if (!event) return null;
  const [[exposants]] = await pool.query('SELECT COALESCE(SUM(montant_paye),0) total FROM exposants WHERE event_id=? AND (a_paye=1 OR montant_paye>0)', [eventId]);
  const [[sponsors]] = await pool.query('SELECT COALESCE(SUM(montant),0) total FROM sponsors WHERE event_id=? AND (statut_paiement IN ("paye","partiel") OR montant>0)', [eventId]);
  const [[equipe]] = await pool.query('SELECT COALESCE(SUM(salaire_jour*nb_jours),0) total FROM employes WHERE event_id=?', [eventId]);
  const [[conventions]] = await pool.query('SELECT COALESCE(SUM(montant),0) total FROM conventions WHERE event_id=?', [eventId]);
  const [[billets]] = await pool.query('SELECT COALESCE(SUM(prix),0) total FROM billets_avion WHERE event_id=?', [eventId]);
  const [[hotels]] = await pool.query('SELECT COALESCE(SUM(prix_nuit*nb_nuits),0) total FROM reservations_hotel WHERE event_id=?', [eventId]);
  const [[restauration]] = await pool.query(`SELECT COALESCE((SELECT montant FROM restauration_simple WHERE event_id=?),
 (SELECT COALESCE(SUM(m.prix_par_personne*ra.nb_personnes),0) FROM restauration_affectations ra JOIN restauration_menus m ON m.id=ra.menu_id WHERE ra.event_id=?)) AS total`, [eventId,eventId]);
  return {
    entrants: { budget_initial:num(event.budget_initial), exposants:num(exposants.total), sponsors:num(sponsors.total) },
    sortants: { equipe:num(equipe.total), conventions:num(conventions.total), billets:num(billets.total), hotels:num(hotels.total), restauration:num(restauration.total) }
  };
}

router.get('/event/:eventId/transactions', authenticate, requireRead('finances','dashboard'), async (req,res)=>{
  const [rows]=await pool.query('SELECT * FROM finance_transactions WHERE event_id=? ORDER BY date_transaction DESC,id DESC',[req.params.eventId]); res.json(rows);
});
router.get('/event/:eventId/summary', authenticate, requireRead('finances','dashboard'), async (req,res)=>{
  const automatic=await automaticSummary(req.params.eventId); if(!automatic) return res.status(404).json({error:'Événement introuvable'});
  const [manualRows]=await pool.query('SELECT type,COALESCE(SUM(montant),0) total FROM finance_transactions WHERE event_id=? GROUP BY type',[req.params.eventId]);
  const manual={entrant:0,sortant:0}; manualRows.forEach(r=>manual[r.type]=num(r.total));
  const autoEntrants=Object.values(automatic.entrants).reduce((a,b)=>a+b,0), autoSortants=Object.values(automatic.sortants).reduce((a,b)=>a+b,0);
  res.json({automatic,manual,totals:{entrants:autoEntrants+manual.entrant,sortants:autoSortants+manual.sortant,balance:autoEntrants+manual.entrant-autoSortants-manual.sortant}});
});
router.post('/transactions', authenticate, requireWrite('finances'), async (req,res)=>{
  const {event_id,type,categorie,libelle,montant,date_transaction,notes}=req.body;
  if(!event_id||!['entrant','sortant'].includes(type)||!libelle||Number(montant)<0) return res.status(400).json({error:'Type, libellé et montant valides requis'});
  const [r]=await pool.query('INSERT INTO finance_transactions (event_id,type,categorie,libelle,montant,date_transaction,notes,created_by) VALUES (?,?,?,?,?,?,?,?)',[event_id,type,categorie||'autre',libelle,montant,date_transaction||null,notes||null,req.user.id]);
  res.json({id:r.insertId});
});
router.put('/transactions/:id', authenticate, requireWrite('finances'), async (req,res)=>{
  const {type,categorie,libelle,montant,date_transaction,notes}=req.body;
  await pool.query('UPDATE finance_transactions SET type=?,categorie=?,libelle=?,montant=?,date_transaction=?,notes=? WHERE id=?',[type,categorie||'autre',libelle,montant,date_transaction||null,notes||null,req.params.id]);res.json({message:'ok'});
});
router.delete('/transactions/:id', authenticate, requireWrite('finances'), async (req,res)=>{await pool.query('DELETE FROM finance_transactions WHERE id=?',[req.params.id]);res.json({message:'supprimée'});});
export default router;
