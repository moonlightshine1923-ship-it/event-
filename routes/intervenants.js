import express from 'express';
import pool from '../config/db.js';
import { authenticate, requireRead, requireWrite } from '../middleware/auth.js';
import upload from '../middleware/upload.js';

const router = express.Router();
const fields = upload.fields([
  { name: 'photo', maxCount: 1 },
  { name: 'engagement', maxCount: 1 },
  { name: 'presentation', maxCount: 1 }
]);

router.get('/event/:eventId', authenticate, requireRead('intervenants', 'programmes', 'dashboard'), async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM intervenants WHERE event_id=? ORDER BY nom, prenom', [req.params.eventId]);
  res.json(rows);
});

router.get('/:id', authenticate, requireRead('intervenants', 'programmes', 'dashboard'), async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM intervenants WHERE id=?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Intervenant introuvable' });
  res.json(rows[0]);
});

router.post('/', authenticate, requireWrite('intervenants', 'programmes'), fields, async (req, res) => {
  const { event_id, nom, prenom, poste, telephone, email, engagement_description, notes } = req.body;
  if (!event_id || !nom || !prenom) return res.status(400).json({ error: 'Nom et prénom requis' });
  const photo = req.files?.photo?.[0];
  const engagement = req.files?.engagement?.[0];
  const presentation = req.files?.presentation?.[0];
  const [result] = await pool.query(`
    INSERT INTO intervenants (event_id, nom, prenom, poste, telephone, email, photo_path, engagement_description, engagement_file_path, presentation_file_path, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `, [event_id, nom, prenom, poste || null, telephone || null, email || null, photo ? '/' + photo.path : null, engagement_description || null, engagement ? '/' + engagement.path : null, presentation ? '/' + presentation.path : null, notes || null]);
  res.json({ id: result.insertId });
});

router.put('/:id', authenticate, requireWrite('intervenants', 'programmes'), fields, async (req, res) => {
  const { nom, prenom, poste, telephone, email, engagement_description, notes } = req.body;
  const sets = ['nom=?','prenom=?','poste=?','telephone=?','email=?','engagement_description=?','notes=?'];
  const values = [nom, prenom, poste || null, telephone || null, email || null, engagement_description || null, notes || null];
  const photo = req.files?.photo?.[0];
  const engagement = req.files?.engagement?.[0];
  const presentation = req.files?.presentation?.[0];
  if (photo) { sets.push('photo_path=?'); values.push('/' + photo.path); }
  if (engagement) { sets.push('engagement_file_path=?'); values.push('/' + engagement.path); }
  if (presentation) { sets.push('presentation_file_path=?'); values.push('/' + presentation.path); }
  values.push(req.params.id);
  await pool.query(`UPDATE intervenants SET ${sets.join(',')} WHERE id=?`, values);
  res.json({ message: 'ok' });
});

router.delete('/:id', authenticate, requireWrite('intervenants', 'programmes'), async (req, res) => {
  await pool.query('DELETE FROM intervenants WHERE id=?', [req.params.id]);
  res.json({ message: 'supprimé' });
});

export default router;
