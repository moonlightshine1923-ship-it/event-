import express from 'express';
import pool from '../config/db.js';
import { authenticate, requireRead, requireWrite } from '../middleware/auth.js';
import upload from '../middleware/upload.js';
const router = express.Router();

router.get('/event/:eventId', authenticate, requireRead('billets','dashboard'), async (req,res)=>{
  const [rows]= await pool.query(`
    SELECT b.*, p.nom, p.prenom, p.email, p.type FROM billets_avion b
    JOIN personnes p ON p.id=b.personne_id
    WHERE b.event_id=? ORDER BY b.date_depart DESC
  `,[req.params.eventId]);
  res.json(rows);
});

router.get('/:id', authenticate, requireRead('billets','dashboard'), async (req,res)=>{
  const [rows]= await pool.query(`
    SELECT b.*, p.nom, p.prenom, p.email, p.type FROM billets_avion b
    JOIN personnes p ON p.id=b.personne_id
    WHERE b.id=?`,[req.params.id]);
  if(!rows.length) return res.status(404).json({error:'Non trouvé'});
  res.json(rows[0]);
});

router.post('/', authenticate, requireWrite('billets'), upload.single('billet'), async (req,res)=>{
  const { event_id, personne_id, compagnie, num_vol_aller, num_vol_retour, aeroport_depart, aeroport_arrivee, date_depart, date_retour, classe, prix, statut, notes } = req.body;
  const billet_file_path = req.file ? req.file.path : null;
  const [result]= await pool.query(
    `INSERT INTO billets_avion (event_id,personne_id,compagnie,num_vol_aller,num_vol_retour,aeroport_depart,aeroport_arrivee,date_depart,date_retour,classe,prix,statut,billet_file_path,notes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [event_id,personne_id,compagnie,num_vol_aller,num_vol_retour,aeroport_depart,aeroport_arrivee,date_depart||null,date_retour||null,classe||'economy',prix||0,statut||'en_attente',billet_file_path,notes]
  );
  res.json({ id: result.insertId });
});

router.put('/:id', authenticate, requireWrite('billets'), upload.single('billet'), async (req,res)=>{
  const { compagnie, num_vol_aller, num_vol_retour, aeroport_depart, aeroport_arrivee, date_depart, date_retour, classe, prix, statut, notes } = req.body;
  let q='UPDATE billets_avion SET compagnie=?,num_vol_aller=?,num_vol_retour=?,aeroport_depart=?,aeroport_arrivee=?,date_depart=?,date_retour=?,classe=?,prix=?,statut=?,notes=?';
  const params=[compagnie,num_vol_aller,num_vol_retour,aeroport_depart,aeroport_arrivee,date_depart,date_retour,classe,prix,statut,notes];
  if(req.file){ q+=', billet_file_path=?'; params.push(req.file.path); }
  q+=' WHERE id=?'; params.push(req.params.id);
  await pool.query(q, params);
  res.json({ message:'ok' });
});

router.delete('/:id', authenticate, requireWrite('billets'), async (req,res)=>{
  await pool.query('DELETE FROM billets_avion WHERE id=?',[req.params.id]);
  res.json({ message:'supprimé' });
});

router.get('/event/:eventId/total', authenticate, requireRead('billets','dashboard'), async (req,res)=>{
  const [[row]]= await pool.query('SELECT COALESCE(SUM(prix),0) as total, COUNT(*) as count FROM billets_avion WHERE event_id=?',[req.params.eventId]);
  res.json(row);
});

export default router;
