import express from 'express';
import pool from '../config/db.js';
import { authenticate, requireRead, requireWrite } from '../middleware/auth.js';
import upload from '../middleware/upload.js';
const router = express.Router();

router.get('/event/:eventId', authenticate, requireRead('billets','dashboard'), async (req,res)=>{
  const [rows]= await pool.query(`
    SELECT b.*, COALESCE(NULLIF(b.passager_nom,''),p.nom) AS nom, COALESCE(NULLIF(b.passager_prenom,''),p.prenom) AS prenom, p.email, p.type, p.photo_path FROM billets_avion b
    LEFT JOIN personnes p ON p.id=b.personne_id
    WHERE b.event_id=? ORDER BY b.date_depart DESC
  `,[req.params.eventId]);
  res.json(rows);
});

router.get('/:id', authenticate, requireRead('billets','dashboard'), async (req,res)=>{
  const [rows]= await pool.query(`
    SELECT b.*, COALESCE(NULLIF(b.passager_nom,''),p.nom) AS nom, COALESCE(NULLIF(b.passager_prenom,''),p.prenom) AS prenom, p.email, p.type, p.photo_path FROM billets_avion b
    LEFT JOIN personnes p ON p.id=b.personne_id
    WHERE b.id=?`,[req.params.id]);
  if(!rows.length) return res.status(404).json({error:'Non trouvé'});
  res.json(rows[0]);
});

const ticketFields=['personne_id','passager_nom','passager_prenom','compagnie','num_vol_aller','num_vol_retour','aeroport_depart','aeroport_arrivee','aeroport_depart_retour','aeroport_arrivee_retour','date_depart','date_arrivee','date_retour','date_arrivee_retour','classe','prix','statut','notes'];
function ticketData(body){
 const data={};for(const key of ticketFields)data[key]=body[key] instanceof Date?body[key].toISOString().slice(0,19).replace('T',' '):body[key]||null;
 data.classe=data.classe||'economy';data.statut=data.statut||'en_attente';data.prix=body.prix||0;
 return data;
}
async function validateTicket(data,eventId){
 if(!eventId)return 'Événement requis';
 if(data.personne_id){
  const [[person]]=await pool.query('SELECT id FROM personnes WHERE id=? AND event_id=?',[data.personne_id,eventId]);
  if(!person)return 'Voyageur invalide pour cet événement';
 }else if(!data.passager_nom||!data.passager_prenom)return 'Nom et prénom du passager requis';
 if(!Number.isFinite(Number(data.prix))||Number(data.prix)<0)return 'Montant invalide';
 for(const key of ['date_depart','date_arrivee','date_retour','date_arrivee_retour']){
  if(data[key]&&!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/.test(data[key]))return 'Date ou heure invalide';
 }
 return null;
}
router.post('/', authenticate, requireWrite('billets'), upload.single('billet'), async(req,res)=>{
 const data=ticketData(req.body),error=await validateTicket(data,req.body.event_id);
 if(error)return res.status(400).json({error});
 const fields=['event_id',...ticketFields,'billet_file_path'];
 const values=[req.body.event_id,...ticketFields.map(k=>data[k]),req.file?'/'+req.file.path:null];
 const [r]=await pool.query(`INSERT INTO billets_avion (${fields.join(',')}) VALUES (${fields.map(()=>'?').join(',')})`,values);
 res.json({id:r.insertId});
});
router.put('/:id', authenticate, requireWrite('billets'), upload.single('billet'), async(req,res)=>{
 const [[old]]=await pool.query('SELECT * FROM billets_avion WHERE id=?',[req.params.id]);
 if(!old)return res.status(404).json({error:'Billet introuvable'});
 const data=ticketData({...old,...req.body}),error=await validateTicket(data,old.event_id);
 if(error)return res.status(400).json({error});
 const fields=ticketFields.map(k=>k+'=?'),values=ticketFields.map(k=>data[k]);
 if(req.file){fields.push('billet_file_path=?');values.push('/'+req.file.path);}
 values.push(req.params.id);await pool.query(`UPDATE billets_avion SET ${fields.join(',')} WHERE id=?`,values);
 res.json({message:'ok'});
});

router.delete('/:id', authenticate, requireWrite('billets'), async (req,res)=>{
  await pool.query('DELETE FROM billets_avion WHERE id=?',[req.params.id]);
  res.json({ message:'supprimé' });
});

router.get('/event/:eventId/total', authenticate, requireRead('billets','dashboard'), async (req,res)=>{
  const [[row]]= await pool.query('SELECT COALESCE(SUM(prix),0) as total, COUNT(*) as count FROM billets_avion WHERE event_id=?',[req.params.eventId]);
  res.json(row);
});

export default router;
