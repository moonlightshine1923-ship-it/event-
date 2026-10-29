import express from 'express';
import pool from '../config/db.js';
import { authenticate, requireRead, requireWrite } from '../middleware/auth.js';
import upload from '../middleware/upload.js';
import {syncStandPlan} from '../services/stand-plan.js';
const router = express.Router();

// Liste par event
router.get('/event/:eventId', authenticate, requireRead('exposants','dashboard'), async (req,res)=>{
  const [rows]= await pool.query(`
    SELECT ex.*, p.nom, p.prenom, p.email, p.telephone, p.entreprise, p.type, p.poste, p.wilaya_id, p.photo_path,
           s.numero as stand_numero, s.zone, s.statut as stand_statut
    FROM exposants ex
    JOIN personnes p ON p.id=ex.personne_id
    LEFT JOIN stands s ON s.exposant_id=ex.id
    WHERE ex.event_id=?
    ORDER BY ex.id DESC`, [req.params.eventId]);
  res.json(rows);
});

router.get('/:id', authenticate, requireRead('exposants','dashboard'), async (req,res)=>{
  const [rows]= await pool.query(`
    SELECT ex.*, p.nom, p.prenom, p.email, p.telephone, p.entreprise, p.type, p.poste, p.wilaya_id, p.photo_path,
           s.numero as stand_numero, s.zone, s.statut as stand_statut
    FROM exposants ex
    JOIN personnes p ON p.id=ex.personne_id
    LEFT JOIN stands s ON s.exposant_id=ex.id
    WHERE ex.id=?`, [req.params.id]);
  if(!rows.length) return res.status(404).json({error:'Non trouvé'});
  res.json(rows[0]);
});

router.post('/', authenticate, requireWrite('exposants'), upload.single('fichier'), async (req,res)=>{
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { event_id, personne_id, personne_data, fiche_technique, convoque_par, domaine_activite, superficie_demandee, a_paye, methode_paiement, montant_paye, montant_restant, besoins_speciaux } = req.body;
    if(!event_id){await conn.rollback();return res.status(400).json({error:'Événement requis'});}
    const [[event]]=await conn.query('SELECT id FROM events WHERE id=? FOR UPDATE',[event_id]);
    if(!event){await conn.rollback();return res.status(404).json({error:'Événement introuvable'});}
    const fichier_path = req.file ? '/'+req.file.path : null;
    let pid = personne_id;
    if(pid){const [[person]]=await conn.query('SELECT id FROM personnes WHERE id=? AND event_id=?',[pid,event_id]);if(!person){await conn.rollback();return res.status(400).json({error:'Personne introuvable dans cet événement'});}}
    if(!pid && personne_data){
      // Créer personne d'abord
      const { nom, prenom, email, telephone, entreprise, poste, wilaya_id } = typeof personne_data==='string' ? JSON.parse(personne_data) : personne_data;
      const [pr]= await conn.query(
        `INSERT INTO personnes (event_id,type,nom,prenom,email,telephone,entreprise,poste,wilaya_id) VALUES (?,'exposant',?,?,?,?,?, ?, ?)`,
        [event_id, nom, prenom, email, telephone, entreprise, poste, wilaya_id||null]
      );
      pid = pr.insertId;
    }
    if(!event_id||!pid) {
      await conn.rollback();
      return res.status(400).json({error:'event_id et personne_id requis'});
    }
    const [ex]= await conn.query(
      `INSERT INTO exposants (personne_id,event_id,fiche_technique,convoque_par,domaine_activite,superficie_demandee,a_paye,methode_paiement,montant_paye,montant_restant,besoins_speciaux,fichier_path)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [pid,event_id,fiche_technique,convoque_par,domaine_activite,superficie_demandee,a_paye?1:0,methode_paiement||null,montant_paye||0,montant_restant||0,besoins_speciaux,fichier_path]
    );
    const exposantId = ex.insertId;

    // Allocate an unused number and grid position under the event lock.
    await syncStandPlan(conn,event_id);
    const [[assigned]]=await conn.query('SELECT numero FROM stands WHERE exposant_id=? AND event_id=? ORDER BY id LIMIT 1',[exposantId,event_id]);
    const numero=assigned?.numero||null;

    await conn.commit();
    res.json({ id: exposantId, personne_id: pid, stand_numero: numero });
  } catch(e){
    await conn.rollback();
    res.status(500).json({error:e.message});
  } finally {
    conn.release();
  }
});

router.put('/:id', authenticate, requireWrite('exposants'), upload.single('fichier'), async(req,res)=>{
 const conn=await pool.getConnection();
 try{
  await conn.beginTransaction();const [[old]]=await conn.query('SELECT * FROM exposants WHERE id=? FOR UPDATE',[req.params.id]);
  if(!old){await conn.rollback();return res.status(404).json({error:'Exposant introuvable'});}
  const data={...old,...req.body},keys=['fiche_technique','convoque_par','domaine_activite','superficie_demandee','a_paye','methode_paiement','montant_paye','montant_restant','besoins_speciaux'];
  data.a_paye=[true,1,'1','true','on'].includes(data.a_paye)?1:0;data.methode_paiement=data.methode_paiement||null;data.montant_paye=data.montant_paye||0;data.montant_restant=data.montant_restant||0;
  const sets=keys.map(k=>k+'=?'),values=keys.map(k=>data[k]??null);
  if(req.file){sets.push('fichier_path=?');values.push('/'+req.file.path);}values.push(req.params.id);
  await conn.query(`UPDATE exposants SET ${sets.join(',')} WHERE id=?`,values);
  if(req.body.personne_data){
   const p=typeof req.body.personne_data==='string'?JSON.parse(req.body.personne_data):req.body.personne_data;
   if(!p.nom||!p.prenom){await conn.rollback();return res.status(400).json({error:'Nom et prénom requis'});}
   const fields=['nom','prenom','email','telephone','entreprise','poste','wilaya_id'].filter(k=>p[k]!==undefined);
   await conn.query(`UPDATE personnes SET ${fields.map(k=>k+'=?').join(',')} WHERE id=?`,[...fields.map(k=>p[k]||null),old.personne_id]);
  }
  await conn.commit();res.json({message:'ok'});
 }catch(e){await conn.rollback();throw e;}finally{conn.release();}
});

router.delete('/:id', authenticate, requireWrite('exposants'), async (req,res)=>{
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE stands SET exposant_id=NULL, statut="libre" WHERE exposant_id=?',[req.params.id]);
    await conn.query('DELETE FROM exposants WHERE id=?',[req.params.id]);
    await conn.commit();
    res.json({ message:'supprimé' });
  } catch(e){
    await conn.rollback();
    res.status(500).json({error:e.message});
  } finally { conn.release(); }
});

export default router;
