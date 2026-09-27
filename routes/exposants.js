import express from 'express';
import pool from '../config/db.js';
import { authenticate, requireRead, requireWrite } from '../middleware/auth.js';
import upload from '../middleware/upload.js';
const router = express.Router();

// Liste par event
router.get('/event/:eventId', authenticate, requireRead('exposants','dashboard'), async (req,res)=>{
  const [rows]= await pool.query(`
    SELECT ex.*, p.nom, p.prenom, p.email, p.telephone, p.entreprise, p.type, p.poste, p.wilaya_id,
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
    SELECT ex.*, p.nom, p.prenom, p.email, p.telephone, p.entreprise, p.type, p.poste, p.wilaya_id,
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
    const fichier_path = req.file ? '/'+req.file.path : null;
    let pid = personne_id;
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

    // Auto création stand
    // trouver prochain numéro libre
    const [countStands]= await conn.query('SELECT COUNT(*) as c FROM stands WHERE event_id=?',[event_id]);
    const numero = `S-${String(countStands[0].c+1).padStart(3,'0')}`;
    // calculer position simple grid 5 colonnes
    const cols=8;
    const idx = countStands[0].c;
    const pos_x = (idx % cols) * 120 + 20;
    const pos_y = Math.floor(idx / cols) * 100 + 20;
    await conn.query(
      `INSERT INTO stands (event_id,numero,zone,taille,statut,exposant_id,pos_x,pos_y,width,height,prix) VALUES (?,?,?,?, 'occupe', ?, ?, ?, 80,80,0)`,
      [event_id, numero, 'A', superficie_demandee||'3x3', exposantId, pos_x, pos_y]
    );

    await conn.commit();
    res.json({ id: exposantId, personne_id: pid, stand_numero: numero });
  } catch(e){
    await conn.rollback();
    res.status(500).json({error:e.message});
  } finally {
    conn.release();
  }
});

router.put('/:id', authenticate, requireWrite('exposants'), upload.single('fichier'), async (req,res)=>{
  const { fiche_technique, convoque_par, domaine_activite, superficie_demandee, a_paye, methode_paiement, montant_paye, montant_restant, besoins_speciaux } = req.body;
  const fichier_path = req.file ? '/'+req.file.path : null;
  if(fichier_path){
    await pool.query(
      `UPDATE exposants SET fiche_technique=?,convoque_par=?,domaine_activite=?,superficie_demandee=?,a_paye=?,methode_paiement=?,montant_paye=?,montant_restant=?,besoins_speciaux=?,fichier_path=? WHERE id=?`,
      [fiche_technique,convoque_par,domaine_activite,superficie_demandee,a_paye?1:0,methode_paiement,montant_paye||0,montant_restant||0,besoins_speciaux,fichier_path,req.params.id]
    );
  } else {
    await pool.query(
      `UPDATE exposants SET fiche_technique=?,convoque_par=?,domaine_activite=?,superficie_demandee=?,a_paye=?,methode_paiement=?,montant_paye=?,montant_restant=?,besoins_speciaux=? WHERE id=?`,
      [fiche_technique,convoque_par,domaine_activite,superficie_demandee,a_paye?1:0,methode_paiement,montant_paye||0,montant_restant||0,besoins_speciaux,req.params.id]
    );
  }
  res.json({ message:'ok' });
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
