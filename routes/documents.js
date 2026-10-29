import express from 'express';
import pool from '../config/db.js';
import { authenticate, requireRead, requireWrite } from '../middleware/auth.js';
import upload from '../middleware/upload.js';
const router = express.Router();

router.get('/event/:eventId', authenticate, requireRead('documents'), async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM event_documents WHERE event_id=? ORDER BY date_document DESC, id DESC', [req.params.eventId]);
  res.json(rows);
});
router.get('/:id', authenticate, requireRead('documents'), async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM event_documents WHERE id=?', [req.params.id]);
  if (!rows.length) return res.status(404).json({error:'Document introuvable'});
  res.json(rows[0]);
});
router.post('/', authenticate, requireWrite('documents'), upload.single('fichier'), async (req, res) => {
  const { event_id, titre, type, date_document, description, notes } = req.body;
  if (!event_id || !titre) return res.status(400).json({error:'Événement et titre requis'});
  const file_path=req.file ? '/' + req.file.path : null;
  const [result]=await pool.query('INSERT INTO event_documents (event_id,titre,type,date_document,description,notes,file_path) VALUES (?,?,?,?,?,?,?)',[event_id,titre,type||'autre',date_document||null,description||null,notes||null,file_path]);
  res.json({id:result.insertId});
});
router.put('/:id', authenticate, requireWrite('documents'), upload.single('fichier'), async (req, res) => {
  const {titre,type,date_document,description,notes}=req.body;
  const sets=['titre=?','type=?','date_document=?','description=?','notes=?']; const values=[titre,type||'autre',date_document||null,description||null,notes||null];
  if(req.file){sets.push('file_path=?');values.push('/'+req.file.path);} values.push(req.params.id);
  await pool.query(`UPDATE event_documents SET ${sets.join(',')} WHERE id=?`,values); res.json({message:'ok'});
});
router.delete('/:id', authenticate, requireWrite('documents'), async (req,res)=>{await pool.query('DELETE FROM event_documents WHERE id=?',[req.params.id]);res.json({message:'supprimé'});});
export default router;
