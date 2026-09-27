import express from 'express';
import pool from '../config/db.js';
import { authenticate, requireRead, requireWrite } from '../middleware/auth.js';
import upload from '../middleware/upload.js';
const router = express.Router();

// Get by event
router.get('/event/:eventId', authenticate, requireRead('personnes','reservations','billets','dashboard'), async (req,res)=>{
  const { type, search } = req.query;
  let q = `SELECT p.*, w.nom as wilaya_nom, e.titre as event_titre,
           ex.a_paye, ex.montant_paye, ex.numero_stand
           FROM personnes p
           LEFT JOIN wilayas w ON w.id=p.wilaya_id
           LEFT JOIN events e ON e.id=p.event_id
           LEFT JOIN exposants ex ON ex.personne_id=p.id
           WHERE p.event_id=?`;
  const params=[req.params.eventId];
  if(type){ q+=' AND p.type=?'; params.push(type); }
  if(search){ q+=' AND (p.nom LIKE ? OR p.prenom LIKE ? OR p.email LIKE ? OR p.entreprise LIKE ? )'; params.push(`%${search}%`,`%${search}%`,`%${search}%`,`%${search}%`); }
  q+=' ORDER BY p.id DESC';
  const [rows]= await pool.query(q, params);
  res.json(rows);
});

router.get('/:id', authenticate, requireRead('personnes','reservations','billets','dashboard'), async (req,res)=>{
  const [rows]= await pool.query('SELECT * FROM personnes WHERE id=?',[req.params.id]);
  if(!rows.length) return res.status(404).json({error:'Non trouvé'});
  res.json(rows[0]);
});

router.post('/', authenticate, requireWrite('personnes'), upload.single('fichier'), async (req,res)=>{
  const { event_id, type, type_custom, nom, prenom, email, telephone, entreprise, poste, pays, wilaya_id, notes } = req.body;
  if(!event_id||!type||!nom||!prenom) return res.status(400).json({error:'Champs requis manquants'});
  const fichier_path = req.file ? '/'+req.file.path : null;
  const [result]= await pool.query(
    `INSERT INTO personnes (event_id,type,type_custom,nom,prenom,email,telephone,entreprise,poste,pays,wilaya_id,notes,fichier_path) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [event_id,type,type_custom||null,nom,prenom,email||null,telephone||null,entreprise||null,poste||null,pays||'Algérie',wilaya_id||null,notes||null,fichier_path]
  );
  res.json({ id: result.insertId });
});

router.put('/:id', authenticate, requireWrite('personnes'), upload.single('fichier'), async (req,res)=>{
  const { type, type_custom, nom, prenom, email, telephone, entreprise, poste, pays, wilaya_id, notes } = req.body;
  const fichier_path = req.file ? '/'+req.file.path : null;
  if (fichier_path) {
    await pool.query(
      `UPDATE personnes SET type=?,type_custom=?,nom=?,prenom=?,email=?,telephone=?,entreprise=?,poste=?,pays=?,wilaya_id=?,notes=?,fichier_path=? WHERE id=?`,
      [type,type_custom||null,nom,prenom,email,telephone,entreprise,poste,pays,wilaya_id||null,notes,fichier_path,req.params.id]
    );
  } else {
    await pool.query(
      `UPDATE personnes SET type=?,type_custom=?,nom=?,prenom=?,email=?,telephone=?,entreprise=?,poste=?,pays=?,wilaya_id=?,notes=? WHERE id=?`,
      [type,type_custom||null,nom,prenom,email,telephone,entreprise,poste,pays,wilaya_id||null,notes,req.params.id]
    );
  }
  res.json({ message:'ok' });
});

router.delete('/:id', authenticate, requireWrite('personnes'), async (req,res)=>{
  await pool.query('DELETE FROM personnes WHERE id=?',[req.params.id]);
  res.json({ message:'supprimé' });
});

export default router;
