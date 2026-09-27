import express from 'express';
import pool from '../config/db.js';
import { authenticate, requireRead, requireWrite } from '../middleware/auth.js';
const router = express.Router();

router.get('/', authenticate, requireRead('hotels','reservations','dashboard'), async (req,res)=>{
  const { wilaya_id, search } = req.query;
  let q = 'SELECT h.*, w.nom as wilaya_nom FROM hotels h LEFT JOIN wilayas w ON w.id=h.wilaya_id WHERE 1=1';
  const params=[];
  if(wilaya_id){ q+=' AND h.wilaya_id=?'; params.push(wilaya_id); }
  if(search){ q+=' AND h.nom LIKE ?'; params.push(`%${search}%`); }
  q+=' ORDER BY h.nom';
  const [rows]= await pool.query(q, params);
  res.json(rows);
});

router.get('/:id', authenticate, requireRead('hotels','reservations','dashboard'), async (req,res)=>{
  const [rows]= await pool.query('SELECT h.*, w.nom as wilaya_nom FROM hotels h LEFT JOIN wilayas w ON w.id=h.wilaya_id WHERE h.id=?',[req.params.id]);
  if(!rows.length) return res.status(404).json({error:'Non trouvé'});
  res.json(rows[0]);
});

router.post('/', authenticate, requireWrite('hotels'), async (req,res)=>{
  const { nom, wilaya_id, adresse, etoiles, telephone, email, site_web, nb_chambres_single, nb_chambres_double, nb_chambres_suite, prix_moyen, notes } = req.body;
  if(!nom||!wilaya_id) return res.status(400).json({error:'Nom et wilaya requis'});
  const [result]= await pool.query(
    `INSERT INTO hotels (nom,wilaya_id,adresse,etoiles,telephone,email,site_web,nb_chambres_single,nb_chambres_double,nb_chambres_suite,prix_moyen,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [nom,wilaya_id,adresse,etoiles||3,telephone,email,site_web,nb_chambres_single||0,nb_chambres_double||0,nb_chambres_suite||0,prix_moyen||0,notes]
  );
  res.json({ id: result.insertId });
});

router.put('/:id', authenticate, requireWrite('hotels'), async (req,res)=>{
  const { nom, wilaya_id, adresse, etoiles, telephone, email, site_web, nb_chambres_single, nb_chambres_double, nb_chambres_suite, prix_moyen, notes } = req.body;
  await pool.query(
    `UPDATE hotels SET nom=?,wilaya_id=?,adresse=?,etoiles=?,telephone=?,email=?,site_web=?,nb_chambres_single=?,nb_chambres_double=?,nb_chambres_suite=?,prix_moyen=?,notes=? WHERE id=?`,
    [nom,wilaya_id,adresse,etoiles||3,telephone,email,site_web,nb_chambres_single||0,nb_chambres_double||0,nb_chambres_suite||0,prix_moyen||0,notes,req.params.id]
  );
  res.json({ message:'ok' });
});

router.delete('/:id', authenticate, requireWrite('hotels'), async (req,res)=>{
  await pool.query('DELETE FROM hotels WHERE id=?',[req.params.id]);
  res.json({ message:'supprimé' });
});

export default router;
