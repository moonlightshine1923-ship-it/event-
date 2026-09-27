import express from 'express';
import pool from '../config/db.js';
import { authenticate, requireRead, requireWrite } from '../middleware/auth.js';
const router = express.Router();

router.get('/event/:eventId', authenticate, requireRead('stands','dashboard'), async (req,res)=>{
  const [rows]= await pool.query(`
    SELECT s.*, ex.id as exposant_id_ref, p.nom, p.prenom, p.entreprise, p.email
    FROM stands s
    LEFT JOIN exposants ex ON ex.id=s.exposant_id
    LEFT JOIN personnes p ON p.id=ex.personne_id
    WHERE s.event_id=? ORDER BY s.zone, s.numero`, [req.params.eventId]);
  res.json(rows);
});

router.post('/', authenticate, requireWrite('stands'), async (req,res)=>{
  const { event_id, numero, zone, taille, superficie, pos_x, pos_y, width, height, statut, prix, equipements } = req.body;
  if(!event_id||!numero) return res.status(400).json({error:'event_id et numero requis'});
  try {
    const [result]= await pool.query(
      `INSERT INTO stands (event_id,numero,zone,taille,superficie,pos_x,pos_y,width,height,statut,prix,equipements) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [event_id,numero,zone||'A',taille||'3x3',superficie||9,pos_x||0,pos_y||0,width||100,height||100,statut||'libre',prix||0,equipements||null]
    );
    res.json({ id: result.insertId });
  } catch(e){
    res.status(400).json({error:e.message});
  }
});

router.put('/:id', authenticate, requireWrite('stands'), async (req,res)=>{
  const { numero, zone, taille, superficie, pos_x, pos_y, width, height, statut, prix, equipements, exposant_id } = req.body;
  await pool.query(
    `UPDATE stands SET numero=?,zone=?,taille=?,superficie=?,pos_x=?,pos_y=?,width=?,height=?,statut=?,prix=?,equipements=?,exposant_id=? WHERE id=?`,
    [numero,zone,taille,superficie,pos_x,pos_y,width,height,statut,prix,equipements,exposant_id||null,req.params.id]
  );
  res.json({ message:'ok' });
});

// Générer plan automatique
router.post('/event/:eventId/generate', authenticate, requireWrite('stands'), async (req,res)=>{
  const { rows=5, cols=8, zone='A', taille='3x3' } = req.body;
  const eventId= req.params.eventId;
  const [existing]= await pool.query('SELECT COUNT(*) as c FROM stands WHERE event_id=?',[eventId]);
  if(existing[0].c>0) return res.status(400).json({error:'Plan déjà existant, supprimez d\'abord'});
  const conn= await pool.getConnection();
  try {
    await conn.beginTransaction();
    let count=0;
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        count++;
        const numero=`${zone}-${String(count).padStart(3,'0')}`;
        const pos_x = c*120 + 20;
        const pos_y = r*100 + 20;
        await conn.query(
          `INSERT INTO stands (event_id,numero,zone,taille,pos_x,pos_y,width,height,statut) VALUES (?,?,?,?,?,?,?,?, 'libre')`,
          [eventId,numero,zone,taille,pos_x,pos_y,90,80]
        );
      }
    }
    await conn.commit();
    res.json({ message:`${count} stands créés`, count });
  } catch(e){
    await conn.rollback();
    res.status(500).json({error:e.message});
  } finally { conn.release(); }
});

router.delete('/:id', authenticate, requireWrite('stands'), async (req,res)=>{
  await pool.query('DELETE FROM stands WHERE id=?',[req.params.id]);
  res.json({ message:'supprimé' });
});

router.delete('/event/:eventId/all', authenticate, requireWrite('stands'), async (req,res)=>{
  await pool.query('DELETE FROM stands WHERE event_id=?',[req.params.eventId]);
  res.json({ message:'tous supprimés' });
});

export default router;
