import express from 'express';
import pool from '../config/db.js';
import { authenticate, requireRead, requireWrite } from '../middleware/auth.js';
import upload from '../middleware/upload.js';
const router = express.Router();

router.get('/event/:eventId', authenticate, requireRead('conventions','dashboard'), async (req,res)=>{
  const [rows]= await pool.query('SELECT * FROM conventions WHERE event_id=? ORDER BY date_debut DESC',[req.params.eventId]);
  res.json(rows.map(r=>({...r, document_paths: typeof r.document_paths==='string'? JSON.parse(r.document_paths||'[]'): r.document_paths})));
});

router.get('/:id', authenticate, requireRead('conventions','dashboard'), async (req,res)=>{
  const [rows]= await pool.query('SELECT * FROM conventions WHERE id=?',[req.params.id]);
  if(!rows.length) return res.status(404).json({error:'Non trouvé'});
  res.json(rows[0]);
});

router.post('/', authenticate, requireWrite('conventions'), upload.array('convention_doc',5), async (req,res)=>{
  const { event_id, type, type_custom, fournisseur, titre, montant, montant_paye, date_debut, date_fin, statut, description, contact } = req.body;
  const docs = req.files ? req.files.map(f=>f.path) : [];
  const [result]= await pool.query(
    `INSERT INTO conventions (event_id,type,type_custom,fournisseur,titre,montant,montant_paye,date_debut,date_fin,statut,description,document_paths,contact)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [event_id,type,type_custom||null,fournisseur,titre,montant||0,montant_paye||0,date_debut||null,date_fin||null,statut||'brouillon',description,JSON.stringify(docs),contact||null]
  );
  res.json({ id: result.insertId });
});

router.put('/:id', authenticate, requireWrite('conventions'), upload.array('convention_doc',5), async (req,res)=>{
  const { type, type_custom, fournisseur, titre, montant, montant_paye, date_debut, date_fin, statut, description, contact } = req.body;
  let q='UPDATE conventions SET type=?,type_custom=?,fournisseur=?,titre=?,montant=?,montant_paye=?,date_debut=?,date_fin=?,statut=?,description=?,contact=?';
  const params=[type,type_custom,fournisseur,titre,montant,montant_paye,date_debut,date_fin,statut,description,contact];
  if(req.files && req.files.length){
    q+=', document_paths=?';
    params.push(JSON.stringify(req.files.map(f=>f.path)));
  }
  q+=' WHERE id=?'; params.push(req.params.id);
  await pool.query(q, params);
  res.json({ message:'ok' });
});

router.delete('/:id', authenticate, requireWrite('conventions'), async (req,res)=>{
  await pool.query('DELETE FROM conventions WHERE id=?',[req.params.id]);
  res.json({ message:'supprimé' });
});

export default router;
