import express from 'express';
import pool from '../config/db.js';
import { authenticate, requireRead, requireWrite } from '../middleware/auth.js';
import upload from '../middleware/upload.js';

const router = express.Router();
const READ = ['equipe', 'employes', 'dashboard'];
const WRITE = ['equipe', 'employes'];

router.get('/event/:eventId/categories', authenticate, requireRead(...READ), async (req, res) => {
  const [rows] = await pool.query(`
    SELECT c.*, COUNT(e.id) AS nb_profiles
    FROM equipe_categories c
    LEFT JOIN employes e ON e.categorie_id=c.id
    WHERE c.event_id=?
    GROUP BY c.id
    ORDER BY c.nom
  `, [req.params.eventId]);
  res.json(rows);
});

router.post('/categories', authenticate, requireWrite(...WRITE), async (req, res) => {
  const { event_id, nom, description, couleur } = req.body;
  if (!event_id || !String(nom || '').trim()) return res.status(400).json({ error: 'event_id et nom requis' });
  try {
    const [result] = await pool.query(
      'INSERT INTO equipe_categories (event_id, nom, description, couleur) VALUES (?,?,?,?)',
      [event_id, String(nom).trim(), description || null, couleur || '#2f6bff']
    );
    res.json({ id: result.insertId, event_id, nom: String(nom).trim(), description: description || null, couleur: couleur || '#2f6bff', nb_profiles: 0 });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Cette catégorie existe déjà pour cet événement' });
    throw e;
  }
});

router.put('/categories/:id', authenticate, requireWrite(...WRITE), async (req, res) => {
  const { nom, description, couleur } = req.body;
  if (!String(nom || '').trim()) return res.status(400).json({ error: 'Nom requis' });
  await pool.query('UPDATE equipe_categories SET nom=?, description=?, couleur=? WHERE id=?', [String(nom).trim(), description || null, couleur || '#2f6bff', req.params.id]);
  res.json({ message: 'ok' });
});

router.delete('/categories/:id', authenticate, requireWrite(...WRITE), async (req, res) => {
  const [[cat]] = await pool.query('SELECT * FROM equipe_categories WHERE id=?', [req.params.id]);
  if (!cat) return res.status(404).json({ error: 'Catégorie introuvable' });
  const [[count]] = await pool.query('SELECT COUNT(*) AS total FROM employes WHERE categorie_id=?', [req.params.id]);
  if (Number(count.total) > 0) return res.status(400).json({ error: 'Impossible de supprimer une catégorie contenant des profils' });
  await pool.query('DELETE FROM equipe_categories WHERE id=?', [req.params.id]);
  res.json({ message: 'supprimée' });
});

router.get('/event/:eventId', authenticate, requireRead(...READ), async (req, res) => {
  const params = [req.params.eventId];
  let where = 'e.event_id=?';
  if (req.query.category_id) { where += ' AND e.categorie_id=?'; params.push(req.query.category_id); }
  const [rows] = await pool.query(`
    SELECT e.*, c.nom AS categorie_nom, c.couleur AS categorie_couleur
    FROM employes e
    LEFT JOIN equipe_categories c ON c.id=e.categorie_id
    WHERE ${where}
    ORDER BY COALESCE(c.nom,e.poste), e.nom, e.prenom
  `, params);
  res.json(rows);
});

router.get('/:id', authenticate, requireRead(...READ), async (req, res) => {
  const [rows] = await pool.query(`
    SELECT e.*, c.nom AS categorie_nom, c.couleur AS categorie_couleur
    FROM employes e LEFT JOIN equipe_categories c ON c.id=e.categorie_id WHERE e.id=?
  `, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Profil introuvable' });
  res.json(rows[0]);
});

router.post('/', authenticate, requireWrite(...WRITE), upload.single('photo'), async (req, res) => {
  const { event_id, categorie_id, nin, nom, prenom, telephone, email, responsable, tache, lieu_affectation, date_debut, date_fin, salaire_jour, nb_jours, statut_paiement, notes } = req.body;
  if (!event_id || !nom || !prenom || (!categorie_id && !req.body.poste)) return res.status(400).json({ error: 'Catégorie, nom et prénom sont requis' });
  if(nin && !/^\d{18}$/.test(String(nin))) return res.status(400).json({error:'Le NIN doit contenir 18 chiffres'});
  let poste = req.body.poste || 'autre';
  if (categorie_id) {
    const [[cat]] = await pool.query('SELECT nom FROM equipe_categories WHERE id=? AND event_id=?', [categorie_id, event_id]);
    if (!cat) return res.status(400).json({ error: 'Catégorie invalide' });
    poste = cat.nom;
  }
  const photo_path = req.file ? '/' + req.file.path : null;
  const [result] = await pool.query(`
    INSERT INTO employes (event_id, categorie_id, nin, nom, prenom, poste, telephone, email, responsable, tache, lieu_affectation, date_debut, date_fin, salaire_jour, nb_jours, statut_paiement, photo_path, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `, [event_id, categorie_id || null, nin || null, nom, prenom, poste, telephone || null, email || null, responsable || null, tache || null, lieu_affectation || null, date_debut || null, date_fin || null, salaire_jour || 0, nb_jours || 1, statut_paiement || 'non_paye', photo_path, notes || null]);
  res.json({ id: result.insertId });
});

router.put('/:id', authenticate, requireWrite(...WRITE), upload.single('photo'), async (req, res) => {
  const { categorie_id, nin, nom, prenom, telephone, email, responsable, tache, lieu_affectation, date_debut, date_fin, salaire_jour, nb_jours, statut_paiement, notes } = req.body;
  if(nin && !/^\d{18}$/.test(String(nin))) return res.status(400).json({error:'Le NIN doit contenir 18 chiffres'});
  let poste = req.body.poste || 'autre';
  if (categorie_id) {
    const [[cat]] = await pool.query('SELECT nom FROM equipe_categories WHERE id=?', [categorie_id]);
    if (cat) poste = cat.nom;
  }
  const fields = ['categorie_id=?','nom=?','prenom=?','poste=?','telephone=?','email=?','responsable=?','tache=?','lieu_affectation=?','date_debut=?','date_fin=?','salaire_jour=?','nb_jours=?','statut_paiement=?','notes=?'];
  const values = [categorie_id || null, nom, prenom, poste, telephone || null, email || null, responsable || null, tache || null, lieu_affectation || null, date_debut || null, date_fin || null, salaire_jour || 0, nb_jours || 1, statut_paiement || 'non_paye', notes || null];
  if (nin !== undefined) { fields.push('nin=?'); values.push(nin || null); }
  if (req.file) { fields.push('photo_path=?'); values.push('/' + req.file.path); }
  values.push(req.params.id);
  await pool.query(`UPDATE employes SET ${fields.join(',')} WHERE id=?`, values);
  res.json({ message: 'ok' });
});

router.delete('/:id', authenticate, requireWrite(...WRITE), async (req, res) => {
  await pool.query('DELETE FROM employes WHERE id=?', [req.params.id]);
  res.json({ message: 'supprimé' });
});

export default router;
