import express from 'express';
import pool from '../config/db.js';
import { authenticate, requireRead, requireWrite } from '../middleware/auth.js';
import upload from '../middleware/upload.js';
const router = express.Router();

router.get('/event/:eventId', authenticate, requireRead('autorisations'), async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM autorisations WHERE event_id=? ORDER BY date_demande DESC, id DESC', [req.params.eventId]);
  res.json(rows);
});
router.get('/:id', authenticate, requireRead('autorisations'), async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM autorisations WHERE id=?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Autorisation introuvable' });
  res.json(rows[0]);
});
router.post('/', authenticate, requireWrite('autorisations'), upload.single('fichier'), async (req, res) => {
  const { event_id, titre, type, organisme, date_demande, date_obtention, statut, description, notes } = req.body;
  if (!event_id || !titre) return res.status(400).json({ error: 'Événement et titre requis' });
  const file_path = req.file ? '/' + req.file.path : null;
  const [result] = await pool.query(`INSERT INTO autorisations (event_id,titre,type,organisme,date_demande,date_obtention,statut,description,notes,file_path) VALUES (?,?,?,?,?,?,?,?,?,?)`, [event_id,titre,type||'autre',organisme||null,date_demande||null,date_obtention||null,statut||'a_demander',description||null,notes||null,file_path]);
  res.json({ id: result.insertId });
});
router.put('/:id', authenticate, requireWrite('autorisations'), upload.single('fichier'), async (req, res) => {
  const { titre, type, organisme, date_demande, date_obtention, statut, description, notes } = req.body;
  const sets=['titre=?','type=?','organisme=?','date_demande=?','date_obtention=?','statut=?','description=?','notes=?'];
  const values=[titre,type||'autre',organisme||null,date_demande||null,date_obtention||null,statut||'a_demander',description||null,notes||null];
  if(req.file){sets.push('file_path=?');values.push('/'+req.file.path);}
  values.push(req.params.id);
  await pool.query(`UPDATE autorisations SET ${sets.join(',')} WHERE id=?`,values);
  res.json({message:'ok'});
});
router.delete('/:id', authenticate, requireWrite('autorisations'), async (req, res) => { await pool.query('DELETE FROM autorisations WHERE id=?',[req.params.id]); res.json({message:'supprimée'}); });
export default router;
