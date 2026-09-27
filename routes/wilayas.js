import express from 'express';
import pool from '../config/db.js';
import { authenticate, requireRead, requireWrite } from '../middleware/auth.js';
const router = express.Router();

router.get('/', authenticate, async (req,res)=>{
  const [rows] = await pool.query('SELECT * FROM wilayas ORDER BY id');
  res.json(rows);
});

router.get('/:id/hotels', authenticate, async (req,res)=>{
  const [rows] = await pool.query('SELECT h.*, w.nom as wilaya_nom FROM hotels h JOIN wilayas w ON w.id=h.wilaya_id WHERE h.wilaya_id=? ORDER BY h.nom', [req.params.id]);
  res.json(rows);
});

export default router;
