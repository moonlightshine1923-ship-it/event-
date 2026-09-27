import express from 'express';
import pool from '../config/db.js';
import { authenticate, requireRead, requireWrite } from '../middleware/auth.js';
const router = express.Router();

router.get('/', authenticate, async (req,res)=>{
  const [rows]= await pool.query('SELECT * FROM rubriques ORDER BY id DESC');
  res.json(rows);
});

router.get('/:id', authenticate, async (req,res)=>{
  const [rows]= await pool.query('SELECT * FROM rubriques WHERE id=?',[req.params.id]);
  if(!rows.length) return res.status(404).json({error:'Non trouvé'});
  res.json(rows[0]);
});

router.post('/', authenticate, requireWrite('events'), async (req,res)=>{
  const { nom, description, couleur } = req.body;
  const [result]= await pool.query('INSERT INTO rubriques (nom,description,couleur) VALUES (?,?,?)',[nom,description,couleur]);
  res.json({ id: result.insertId });
});

router.put('/:id', authenticate, requireWrite('events'), async (req,res)=>{
  const { nom, description, couleur } = req.body;
  await pool.query('UPDATE rubriques SET nom=?,description=?,couleur=? WHERE id=?',[nom,description,couleur,req.params.id]);
  res.json({ message:'ok' });
});

router.delete('/:id', authenticate, requireWrite('events'), async (req,res)=>{
  await pool.query('DELETE FROM rubriques WHERE id=?',[req.params.id]);
  res.json({ message:'supprimé' });
});

export default router;
