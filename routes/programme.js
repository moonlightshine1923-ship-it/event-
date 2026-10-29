import express from 'express';
import pool from '../config/db.js';
import { authenticate, requireRead, requireWrite } from '../middleware/auth.js';
import upload from '../middleware/upload.js';
const router = express.Router();

router.get('/event/:eventId', authenticate, requireRead('programmes','dashboard'), async (req,res)=>{
  const [rows]= await pool.query('SELECT * FROM programmes WHERE event_id=? ORDER BY jour, heure_debut',[req.params.eventId]);
  res.json(rows);
});

router.get('/:id', authenticate, requireRead('programmes','dashboard'), async (req,res)=>{
  const [rows]= await pool.query('SELECT * FROM programmes WHERE id=?',[req.params.id]);
  if(!rows.length) return res.status(404).json({error:'Non trouvé'});
  res.json(rows[0]);
});

router.post('/', authenticate, requireWrite('programmes'), upload.single('presentation'), async (req,res)=>{
  let selectedIntervenant=null;
  if(req.body.intervenant_id){
    const [[speaker]]=await pool.query('SELECT * FROM intervenants WHERE id=? AND event_id=?',[req.body.intervenant_id,req.body.event_id]);
    if(!speaker)return res.status(400).json({error:'Intervenant introuvable dans cet événement'});
    selectedIntervenant=speaker;
    Object.assign(req.body,{intervenant_nom:speaker.nom,intervenant_prenom:speaker.prenom,intervenant_poste:speaker.poste||'',intervenant_email:speaker.email||''});
  }
  const { event_id, jour, heure_debut, heure_fin, titre, description, type, intervenant_nom, intervenant_prenom, intervenant_poste, intervenant_is_vip, intervenant_email, theme, salle, ordre } = req.body;
  if(!event_id||!jour||!heure_debut||!heure_fin||!titre) return res.status(400).json({error:'Champs requis'});
  const presentation_file = req.file ? req.file.path : (selectedIntervenant?.presentation_file_path?.replace(/^\//,'')||null);
  let presentation_type=null;
  if(req.file){
    const ext = req.file.originalname.split('.').pop().toLowerCase();
    if(['pdf'].includes(ext)) presentation_type='pdf';
    else if(['ppt'].includes(ext)) presentation_type='ppt';
    else if(['pptx'].includes(ext)) presentation_type='pptx';
    else if(['doc','docx'].includes(ext)) presentation_type=ext;
  }
  const [result]= await pool.query(
    `INSERT INTO programmes (event_id,jour,heure_debut,heure_fin,titre,description,type,intervenant_nom,intervenant_prenom,intervenant_poste,intervenant_is_vip,intervenant_email,theme,salle,presentation_file,presentation_type,ordre)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [event_id,jour,heure_debut,heure_fin,titre,description,type||'presentation',intervenant_nom,intervenant_prenom,intervenant_poste,intervenant_is_vip?1:0,intervenant_email,theme,salle,presentation_file,presentation_type,ordre||0]
  );
  res.json({ id: result.insertId });
});

router.put('/:id', authenticate, requireWrite('programmes'), upload.single('presentation'), async (req,res)=>{
  const { jour, heure_debut, heure_fin, titre, description, type, intervenant_nom, intervenant_prenom, intervenant_poste, intervenant_is_vip, intervenant_email, theme, salle, ordre } = req.body;
  let q='UPDATE programmes SET jour=?,heure_debut=?,heure_fin=?,titre=?,description=?,type=?,intervenant_nom=?,intervenant_prenom=?,intervenant_poste=?,intervenant_is_vip=?,intervenant_email=?,theme=?,salle=?,ordre=?';
  const params=[jour,heure_debut,heure_fin,titre,description,type,intervenant_nom,intervenant_prenom,intervenant_poste,intervenant_is_vip?1:0,intervenant_email,theme,salle,ordre];
  if(req.file){
    q+=', presentation_file=?, presentation_type=?';
    const ext = req.file.originalname.split('.').pop().toLowerCase();
    params.push(req.file.path, ext);
  }
  q+=' WHERE id=?'; params.push(req.params.id);
  await pool.query(q, params);
  res.json({ message:'ok' });
});

router.delete('/:id', authenticate, requireWrite('programmes'), async (req,res)=>{
  await pool.query('DELETE FROM programmes WHERE id=?',[req.params.id]);
  res.json({ message:'supprimé' });
});

export default router;
