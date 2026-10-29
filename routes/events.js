import express from 'express';
import pool from '../config/db.js';
import { authenticate, requireRead, requireWrite } from '../middleware/auth.js';
import upload from '../middleware/upload.js';
const router = express.Router();

// List
router.get('/', authenticate, async (req,res)=>{
  const [rows]= await pool.query(`
    SELECT e.*, r.nom as rubrique_nom, w.nom as wilaya_nom,
    (SELECT COUNT(*) FROM personnes WHERE event_id=e.id) as total_personnes,
    (SELECT COUNT(*) FROM exposants WHERE event_id=e.id) as total_exposants
    FROM events e
    LEFT JOIN rubriques r ON r.id=e.rubrique_id
    LEFT JOIN wilayas w ON w.id=e.wilaya_id
    ORDER BY e.date_debut DESC
  `);
  res.json(rows);
});

router.get('/:id', authenticate, async (req,res)=>{
  const [rows]= await pool.query(`
    SELECT e.*, r.nom as rubrique_nom, w.nom as wilaya_nom FROM events e
    LEFT JOIN rubriques r ON r.id=e.rubrique_id
    LEFT JOIN wilayas w ON w.id=e.wilaya_id
    WHERE e.id=?`, [req.params.id]);
  if(!rows.length) return res.status(404).json({error:'Non trouvé'});
  res.json(rows[0]);
});

router.post('/', authenticate, requireWrite('events'), async (req,res)=>{
  const { rubrique_id,titre,theme,description,emplacement,wilaya_id,date_debut,date_fin,heure_debut,heure_fin,budget_initial,nb_personnes_prevu,nb_invites,nb_exposants_prevu,nb_vip_prevu,statut } = req.body;
  if(!titre) return res.status(400).json({error:'Titre requis'});
  const [result]= await pool.query(
    `INSERT INTO events (rubrique_id,titre,theme,description,emplacement,wilaya_id,date_debut,date_fin,heure_debut,heure_fin,budget_initial,nb_personnes_prevu,nb_invites,nb_exposants_prevu,nb_vip_prevu,statut,created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, ?, ?)`,
    [rubrique_id||null,titre,theme,description,emplacement,wilaya_id||null,date_debut||null,date_fin||null,heure_debut||null,heure_fin||null,budget_initial||0,nb_personnes_prevu||0,nb_invites||0,nb_exposants_prevu||0,nb_vip_prevu||0,statut||'brouillon',req.user.id]
  );
  // create placeholders for the new event
  await pool.query('INSERT IGNORE INTO restauration_configs (event_id) VALUES (?)',[result.insertId]);
  for (const nom of ['Hôtesses','Agents de sécurité','Serveurs','Accueil','Technique','Nettoyage','Transport','Autre']) {
    await pool.query('INSERT IGNORE INTO equipe_categories (event_id,nom) VALUES (?,?)',[result.insertId,nom]);
  }
  res.json({ id: result.insertId });
});

router.put('/:id', authenticate, requireWrite('events'), async (req,res)=>{
  const { rubrique_id,titre,theme,description,emplacement,wilaya_id,date_debut,date_fin,heure_debut,heure_fin,budget_initial,nb_personnes_prevu,nb_invites,nb_exposants_prevu,nb_vip_prevu,statut } = req.body;
  await pool.query(
    `UPDATE events SET rubrique_id=?,titre=?,theme=?,description=?,emplacement=?,wilaya_id=?,date_debut=?,date_fin=?,heure_debut=?,heure_fin=?,budget_initial=?,nb_personnes_prevu=?,nb_invites=?,nb_exposants_prevu=?,nb_vip_prevu=?,statut=? WHERE id=?`,
    [rubrique_id||null,titre,theme,description,emplacement,wilaya_id||null,date_debut||null,date_fin||null,heure_debut||null,heure_fin||null,budget_initial||0,nb_personnes_prevu||0,nb_invites||0,nb_exposants_prevu||0,nb_vip_prevu||0,statut||'brouillon',req.params.id]
  );
  res.json({ message:'ok' });
});

router.delete('/:id', authenticate, requireWrite('events'), async (req,res)=>{
  await pool.query('DELETE FROM events WHERE id=?',[req.params.id]);
  res.json({ message:'supprimé' });
});

router.post('/:id/plan-photo', authenticate, requireWrite('events'), upload.single('plan_photo'), async (req,res)=>{
  const plan_photo = req.file ? '/'+req.file.path : null;
  if(!plan_photo) return res.status(400).json({error:'Fichier requis'});
  await pool.query('UPDATE events SET plan_photo=? WHERE id=?',[plan_photo,req.params.id]);
  res.json({ message:'Plan mis à jour', plan_photo });
});

// FINANCE SUMMARY
router.get('/:id/finance', authenticate, requireRead('dashboard','events'), async (req,res)=>{
  const eventId = req.params.id;
  const [[event]] = await pool.query('SELECT * FROM events WHERE id=?',[eventId]);
  if(!event) return res.status(404).json({error:'Event non trouvé'});

  const [[entrantsExposants]] = await pool.query('SELECT COALESCE(SUM(montant_paye),0) as total FROM exposants WHERE event_id=? AND (a_paye=1 OR montant_paye > 0)',[eventId]);
  const [[entrantsSponsors]] = await pool.query('SELECT COALESCE(SUM(montant),0) as total FROM sponsors WHERE event_id=? AND (statut_paiement="paye" OR statut_paiement="partiel" OR montant > 0)',[eventId]);
  const totalEntrants = parseFloat(event.budget_initial||0) + parseFloat(entrantsExposants.total||0) + parseFloat(entrantsSponsors.total||0);

  const [[sortantsEmployes]] = await pool.query('SELECT COALESCE(SUM(salaire_jour * nb_jours),0) as total FROM employes WHERE event_id=?',[eventId]);
  const [[sortantsConventions]] = await pool.query('SELECT COALESCE(SUM(montant),0) as total FROM conventions WHERE event_id=?',[eventId]);
  const [[sortantsBillets]] = await pool.query('SELECT COALESCE(SUM(prix),0) as total FROM billets_avion WHERE event_id=?',[eventId]);
  const [[sortantsHotels]] = await pool.query('SELECT COALESCE(SUM(prix_nuit * nb_nuits),0) as total FROM reservations_hotel WHERE event_id=?',[eventId]);

  // restauration total = somme prix_par_personne * nb_personnes affectées approx
  const [[sortantsRestauration]] = await pool.query(`SELECT COALESCE((SELECT montant FROM restauration_simple WHERE event_id=?),
 (SELECT COALESCE(SUM(m.prix_par_personne*ra.nb_personnes),0) FROM restauration_affectations ra JOIN restauration_menus m ON m.id=ra.menu_id WHERE ra.event_id=?)) AS total`, [eventId,eventId]);
  const [[manualEntrants]] = await pool.query('SELECT COALESCE(SUM(montant),0) as total FROM finance_transactions WHERE event_id=? AND type="entrant"',[eventId]);
  const [[manualSortants]] = await pool.query('SELECT COALESCE(SUM(montant),0) as total FROM finance_transactions WHERE event_id=? AND type="sortant"',[eventId]);

  const totalSortants = parseFloat(sortantsEmployes.total||0) + parseFloat(sortantsConventions.total||0) + parseFloat(sortantsBillets.total||0) + parseFloat(sortantsHotels.total||0) + parseFloat(sortantsRestauration.total||0) + parseFloat(manualSortants.total||0);

  res.json({
    event,
    entrants: {
      budget_initial: parseFloat(event.budget_initial||0),
      exposants: parseFloat(entrantsExposants.total||0),
      sponsors: parseFloat(entrantsSponsors.total||0),
      manuel: parseFloat(manualEntrants.total||0),
      total: totalEntrants + parseFloat(manualEntrants.total||0)
    },
    sortants: {
      employes: parseFloat(sortantsEmployes.total||0),
      conventions: parseFloat(sortantsConventions.total||0),
      billets: parseFloat(sortantsBillets.total||0),
      hotels: parseFloat(sortantsHotels.total||0),
      restauration: parseFloat(sortantsRestauration.total||0),
      manuel: parseFloat(manualSortants.total||0),
      total: totalSortants
    },
    balance: totalEntrants + parseFloat(manualEntrants.total||0) - totalSortants
  });
});

// GLOBAL STATS
router.get('/:id/stats', authenticate, requireRead('dashboard','events'), async (req,res)=>{
  const eventId= req.params.id;
  const queries = {
    personnes: 'SELECT COUNT(*) as total, SUM(type="exposant") as exposants, SUM(type="invite_vip") as vip, SUM(type="invite_normal") as invites FROM personnes WHERE event_id=?',
    exposantsPayes: 'SELECT COUNT(*) as payes, COUNT(*) - SUM(a_paye) as non_payes FROM exposants WHERE event_id=?',
    stands: 'SELECT COUNT(*) as total, SUM(statut="libre") as libres, SUM(statut="occupe") as occupes, SUM(statut="reserve") as reserves FROM stands WHERE event_id=?',
    employes: 'SELECT COUNT(*) as total FROM employes WHERE event_id=?',
    sponsors: 'SELECT COUNT(*) as total, SUM(type="platinium") as platinium, SUM(type="gold") as gold, SUM(type="silver") as silver, SUM(type="bronze") as bronze FROM sponsors WHERE event_id=?'
  };
  const results={};
  for(const [k,q] of Object.entries(queries)){
    const [[row]]= await pool.query(q,[eventId]);
    results[k]=row;
  }
  res.json(results);
});

export default router;
