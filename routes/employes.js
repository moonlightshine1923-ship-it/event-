import express from 'express';
import pool from '../config/db.js';
import { authenticate, requireRead, requireWrite } from '../middleware/auth.js';
import upload from '../middleware/upload.js';
const router = express.Router();

router.get('/event/:eventId', authenticate, requireRead('employes','dashboard'), async (req,res)=>{
  const [rows]= await pool.query('SELECT * FROM employes WHERE event_id=? ORDER BY poste, nom', [req.params.eventId]);
  res.json(rows);
});

router.get('/:id', authenticate, requireRead('employes','dashboard'), async (req,res)=>{
  const [rows]= await pool.query('SELECT * FROM employes WHERE id=?', [req.params.id]);
  if(!rows.length) return res.status(404).json({error:'Non trouvé'});
  res.json(rows[0]);
});

// Postes custom
router.get('/postes/event/:eventId', authenticate, requireRead('employes','dashboard'), async (req,res)=>{
  const [rows]= await pool.query('SELECT * FROM postes_employes WHERE event_id=? ORDER BY titre', [req.params.eventId]);
  res.json(rows);
});

router.post('/postes', authenticate, requireWrite('employes'), async (req,res)=>{
  const { event_id, titre } = req.body;
  if(!event_id||!titre) return res.status(400).json({error:'event_id et titre requis'});
  const [resInsert] = await pool.query('INSERT INTO postes_employes (event_id, titre) VALUES (?,?)', [event_id, titre]);
  res.json({ id: resInsert.insertId, event_id, titre });
});

router.delete('/postes/:id', authenticate, requireWrite('employes'), async (req,res)=>{
  await pool.query('DELETE FROM postes_employes WHERE id=?', [req.params.id]);
  res.json({ message:'supprimé' });
});

router.post('/', authenticate, requireWrite('employes'), upload.single('fichier'), async (req,res)=>{
  const { event_id, nom, prenom, poste, poste_custom, telephone, email, tache, lieu_affectation, date_debut, date_fin, salaire_jour, nb_jours, statut_paiement } = req.body;
  if(!event_id||!nom||!prenom||!poste) return res.status(400).json({error:'Champs requis manquants'});
  const fichier_path = req.file ? '/'+req.file.path : null;
  const [result]= await pool.query(
    `INSERT INTO employes (event_id,nom,prenom,poste,poste_custom,telephone,email,tache,lieu_affectation,date_debut,date_fin,salaire_jour,nb_jours,statut_paiement,fichier_path)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [event_id,nom,prenom,poste,poste_custom||null,telephone||null,email||null,tache||null,lieu_affectation||null,date_debut||null,date_fin||null,salaire_jour||0,nb_jours||1,statut_paiement||'non_paye',fichier_path]
  );
  res.json({ id: result.insertId });
});

router.put('/:id', authenticate, requireWrite('employes'), upload.single('fichier'), async (req,res)=>{
  const { nom, prenom, poste, poste_custom, telephone, email, tache, lieu_affectation, date_debut, date_fin, salaire_jour, nb_jours, statut_paiement } = req.body;
  const fichier_path = req.file ? '/'+req.file.path : null;
  if(fichier_path){
    await pool.query(
      `UPDATE employes SET nom=?,prenom=?,poste=?,poste_custom=?,telephone=?,email=?,tache=?,lieu_affectation=?,date_debut=?,date_fin=?,salaire_jour=?,nb_jours=?,statut_paiement=?,fichier_path=? WHERE id=?`,
      [nom,prenom,poste,poste_custom,telephone,email,tache,lieu_affectation,date_debut,date_fin,salaire_jour,nb_jours,statut_paiement,fichier_path,req.params.id]
    );
  } else {
    await pool.query(
      `UPDATE employes SET nom=?,prenom=?,poste=?,poste_custom=?,telephone=?,email=?,tache=?,lieu_affectation=?,date_debut=?,date_fin=?,salaire_jour=?,nb_jours=?,statut_paiement=? WHERE id=?`,
      [nom,prenom,poste,poste_custom,telephone,email,tache,lieu_affectation,date_debut,date_fin,salaire_jour,nb_jours,statut_paiement,req.params.id]
    );
  }
  res.json({ message:'ok' });
});

router.delete('/:id', authenticate, requireWrite('employes'), async (req,res)=>{
  await pool.query('DELETE FROM employes WHERE id=?',[req.params.id]);
  res.json({ message:'supprimé' });
});

export default router;
