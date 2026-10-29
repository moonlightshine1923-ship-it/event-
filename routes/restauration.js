import express from 'express';
import pool from '../config/db.js';
import { authenticate, requireRead, requireWrite } from '../middleware/auth.js';
import upload from '../middleware/upload.js';
const router = express.Router();

// Simplified screen: legacy menus and assignments remain archived.
router.get('/event/:eventId/simple', authenticate, requireRead('restauration','dashboard'), async(req,res)=>{
 const [[row]]=await pool.query('SELECT * FROM restauration_simple WHERE event_id=?',[req.params.eventId]);
 const [factures]=await pool.query('SELECT * FROM restauration_factures WHERE event_id=? ORDER BY id DESC',[req.params.eventId]);
 res.json({...row,factures});
});
router.put('/event/:eventId/simple', authenticate, requireWrite('restauration'), async(req,res)=>{
 const {menu,achats,montant}=req.body;
 if(!Number.isFinite(Number(montant))||Number(montant)<0) return res.status(400).json({error:'Montant positif ou nul requis'});
 await pool.query('INSERT INTO restauration_simple (event_id,menu,achats,montant) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE menu=VALUES(menu),achats=VALUES(achats),montant=VALUES(montant)',[req.params.eventId,menu||'',achats||'',montant]);
 res.json({message:'ok'});
});
router.post('/event/:eventId/factures', authenticate, requireWrite('restauration'), upload.single('fichier'), async(req,res)=>{
 if(!req.file) return res.status(400).json({error:'Facture requise'});
 const [r]=await pool.query('INSERT INTO restauration_factures (event_id,nom,file_path) VALUES (?,?,?)',[req.params.eventId,req.file.originalname,'/'+req.file.path]);
 res.json({id:r.insertId});
});
router.delete('/factures/:id', authenticate, requireWrite('restauration'), async(req,res)=>{
 await pool.query('DELETE FROM restauration_factures WHERE id=?',[req.params.id]);res.json({message:'ok'});
});

// Config
router.get('/event/:eventId/config', authenticate, requireRead('restauration','dashboard'), async (req,res)=>{
  const [rows]= await pool.query('SELECT * FROM restauration_configs WHERE event_id=?',[req.params.eventId]);
  if(!rows.length) {
    await pool.query('INSERT INTO restauration_configs (event_id) VALUES (?)',[req.params.eventId]);
    const [newRows]= await pool.query('SELECT * FROM restauration_configs WHERE event_id=?',[req.params.eventId]);
    return res.json(newRows[0]);
  }
  res.json(rows[0]);
});

router.put('/event/:eventId/config', authenticate, requireWrite('restauration'), async (req,res)=>{
  const { nb_salles_vip, nb_salles_normales, capacite_salle_vip, capacite_salle_normale, notes } = req.body;
  await pool.query(
    `INSERT INTO restauration_configs (event_id,nb_salles_vip,nb_salles_normales,capacite_salle_vip,capacite_salle_normale,notes)
     VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE nb_salles_vip=?,nb_salles_normales=?,capacite_salle_vip=?,capacite_salle_normale=?,notes=?`,
    [req.params.eventId,nb_salles_vip,nb_salles_normales,capacite_salle_vip,capacite_salle_normale,notes,
     nb_salles_vip,nb_salles_normales,capacite_salle_vip,capacite_salle_normale,notes]
  );
  res.json({ message:'ok' });
});

// Menus
router.get('/event/:eventId/menus', authenticate, requireRead('restauration','dashboard'), async (req,res)=>{
  const [rows]= await pool.query('SELECT * FROM restauration_menus WHERE event_id=? ORDER BY type_repas',[req.params.eventId]);
  res.json(rows);
});

router.post('/menus', authenticate, requireWrite('restauration'), async (req,res)=>{
  const { event_id, type_repas, nom_menu, description, prix_par_personne, fournisseur } = req.body;
  const [result]= await pool.query(
    `INSERT INTO restauration_menus (event_id,type_repas,nom_menu,description,prix_par_personne,fournisseur) VALUES (?,?,?,?,?,?)`,
    [event_id,type_repas,nom_menu,description,prix_par_personne,fournisseur]
  );
  res.json({ id: result.insertId });
});

router.put('/menus/:id', authenticate, requireWrite('restauration'), async (req,res)=>{
  const { type_repas, nom_menu, description, prix_par_personne, fournisseur } = req.body;
  await pool.query(
    `UPDATE restauration_menus SET type_repas=?,nom_menu=?,description=?,prix_par_personne=?,fournisseur=? WHERE id=?`,
    [type_repas,nom_menu,description,prix_par_personne,fournisseur,req.params.id]
  );
  res.json({ message:'ok' });
});

router.delete('/menus/:id', authenticate, requireWrite('restauration'), async (req,res)=>{
  await pool.query('DELETE FROM restauration_menus WHERE id=?',[req.params.id]);
  res.json({ message:'supprimé' });
});

// Affectations
router.get('/event/:eventId/affectations', authenticate, requireRead('restauration','dashboard'), async (req,res)=>{
  const [rows]= await pool.query(`
    SELECT ra.*, p.nom, p.prenom, p.type, m.nom_menu, m.prix_par_personne, m.type_repas
    FROM restauration_affectations ra
    JOIN personnes p ON p.id=ra.personne_id
    LEFT JOIN restauration_menus m ON m.id=ra.menu_id
    WHERE ra.event_id=? ORDER BY ra.type_salle, p.type
  `,[req.params.eventId]);
  res.json(rows);
});

router.post('/affectations', authenticate, requireWrite('restauration'), async (req,res)=>{
  const { event_id, personne_id, menu_id, type_salle, nb_personnes, date_repas } = req.body;
  // auto vip detection
  let finalSalle = type_salle;
  if(!finalSalle){
    const [pers]= await pool.query('SELECT type FROM personnes WHERE id=?',[personne_id]);
    if(pers.length && pers[0].type==='invite_vip') finalSalle='vip';
    else finalSalle='normale';
  }
  const [result]= await pool.query(
    `INSERT INTO restauration_affectations (event_id,personne_id,menu_id,type_salle,nb_personnes,date_repas) VALUES (?,?,?,?,?,?)`,
    [event_id,personne_id,menu_id||null,finalSalle,nb_personnes||1,date_repas||null]
  );
  res.json({ id: result.insertId });
});

router.delete('/affectations/:id', authenticate, requireWrite('restauration'), async (req,res)=>{
  await pool.query('DELETE FROM restauration_affectations WHERE id=?',[req.params.id]);
  res.json({ message:'supprimé' });
});

// Summary
router.get('/event/:eventId/summary', authenticate, requireRead('restauration','dashboard'), async (req,res)=>{
  const eventId= req.params.eventId;
  const [vipCount]= await pool.query(`SELECT COUNT(*) as c FROM restauration_affectations WHERE event_id=? AND type_salle='vip'`,[eventId]);
  const [normCount]= await pool.query(`SELECT COUNT(*) as c FROM restauration_affectations WHERE event_id=? AND type_salle='normale'`,[eventId]);
  const [menus]= await pool.query(`
    SELECT m.type_repas, COUNT(ra.id) as nb, SUM(m.prix_par_personne * ra.nb_personnes) as total
    FROM restauration_affectations ra JOIN restauration_menus m ON m.id=ra.menu_id
    WHERE ra.event_id=? GROUP BY m.type_repas
  `,[eventId]);
  const [[total]]= await pool.query(`
    SELECT COALESCE(SUM(m.prix_par_personne * ra.nb_personnes),0) as total
    FROM restauration_affectations ra JOIN restauration_menus m ON m.id=ra.menu_id
    WHERE ra.event_id=?`,[eventId]);
  res.json({ vip: vipCount[0].c, normale: normCount[0].c, par_menu: menus, total: total.total });
});

export default router;
