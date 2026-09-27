import express from 'express';
import pool from '../config/db.js';
import { authenticate, requireRead, requireWrite } from '../middleware/auth.js';
import upload from '../middleware/upload.js';
const router = express.Router();

router.get('/event/:eventId', authenticate, requireRead('sponsors','dashboard'), async (req,res)=>{
  const [rows]= await pool.query('SELECT * FROM sponsors WHERE event_id=? ORDER BY FIELD(type,"platinium","gold","silver","bronze"), montant DESC',[req.params.eventId]);
  res.json(rows);
});

router.get('/:id', authenticate, requireRead('sponsors','dashboard'), async (req,res)=>{
  const [rows]= await pool.query('SELECT * FROM sponsors WHERE id=?',[req.params.id]);
  if(!rows.length) return res.status(404).json({error:'Non trouvé'});
  res.json(rows[0]);
});

router.post('/', authenticate, requireWrite('sponsors'), upload.single('logo'), async (req,res)=>{
  const { event_id, nom, type, montant, entreprise, contact_nom, contact_email, contact_tel, avantages, statut_paiement } = req.body;
  if(!event_id||!nom||!type) return res.status(400).json({error:'Champs requis'});
  const logo_path = req.file ? req.file.path : null;
  const [result]= await pool.query(
    `INSERT INTO sponsors (event_id,nom,type,montant,entreprise,contact_nom,contact_email,contact_tel,logo_path,avantages,statut_paiement)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [event_id,nom,type,montant||0,entreprise,contact_nom,contact_email,contact_tel,logo_path,avantages,statut_paiement||'en_attente']
  );
  res.json({ id: result.insertId });
});

router.put('/:id', authenticate, requireWrite('sponsors'), upload.single('logo'), async (req,res)=>{
  const { nom, type, montant, entreprise, contact_nom, contact_email, contact_tel, avantages, statut_paiement } = req.body;
  let q='UPDATE sponsors SET nom=?,type=?,montant=?,entreprise=?,contact_nom=?,contact_email=?,contact_tel=?,avantages=?,statut_paiement=?';
  const params=[nom,type,montant,entreprise,contact_nom,contact_email,contact_tel,avantages,statut_paiement];
  if(req.file){ q+=', logo_path=?'; params.push(req.file.path); }
  q+=' WHERE id=?'; params.push(req.params.id);
  await pool.query(q, params);
  res.json({ message:'ok' });
});

router.delete('/:id', authenticate, requireWrite('sponsors'), async (req,res)=>{
  await pool.query('DELETE FROM sponsors WHERE id=?',[req.params.id]);
  res.json({ message:'supprimé' });
});

export default router;
