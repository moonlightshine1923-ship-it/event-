import express from 'express';
import pool from '../config/db.js';
import { authenticate, requireRead, requireWrite } from '../middleware/auth.js';
const router = express.Router();

router.get('/event/:eventId', authenticate, requireRead('reservations','dashboard'), async (req,res)=>{
  const [rows]= await pool.query(`
    SELECT rh.*, h.nom as hotel_nom, w.nom as wilaya_nom,
           (SELECT COUNT(*) FROM reservation_occupants WHERE reservation_id=rh.id) as nb_occupants
    FROM reservations_hotel rh
    JOIN hotels h ON h.id=rh.hotel_id
    LEFT JOIN wilayas w ON w.id=h.wilaya_id
    WHERE rh.event_id=? ORDER BY rh.date_arrivee
  `,[req.params.eventId]);
  res.json(rows);
});

router.get('/:id', authenticate, requireRead('reservations','dashboard'), async (req,res)=>{
  const [resv]= await pool.query(`
    SELECT rh.*, h.nom as hotel_nom FROM reservations_hotel rh JOIN hotels h ON h.id=rh.hotel_id WHERE rh.id=?`, [req.params.id]);
  if(!resv.length) return res.status(404).json({error:'Non trouvé'});
  const [occupants]= await pool.query(`
    SELECT ro.*, p.nom, p.prenom, p.email, p.type FROM reservation_occupants ro
    JOIN personnes p ON p.id=ro.personne_id WHERE ro.reservation_id=?`, [req.params.id]);
  res.json({ ...resv[0], occupants });
});

router.post('/', authenticate, requireWrite('reservations'), async (req,res)=>{
  const { event_id, hotel_id, type_chambre, numero_chambre, capacite_max, prix_nuit, nb_nuits, date_arrivee, date_depart, statut, notes, occupant_ids } = req.body;
  if(!event_id||!hotel_id||!type_chambre) return res.status(400).json({error:'Champs requis'});
  const conn= await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result]= await conn.query(
      `INSERT INTO reservations_hotel (event_id,hotel_id,type_chambre,numero_chambre,capacite_max,prix_nuit,nb_nuits,date_arrivee,date_depart,statut,notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [event_id,hotel_id,type_chambre,numero_chambre||null,capacite_max||(type_chambre==='single'?1:type_chambre==='double'?2:3),prix_nuit||0,nb_nuits||1,date_arrivee||null,date_depart||null,statut||'reservee',notes||null]
    );
    const reservationId = result.insertId;
    if(occupant_ids && Array.isArray(occupant_ids)){
      for(const pid of occupant_ids){
        await conn.query('INSERT INTO reservation_occupants (reservation_id,personne_id,est_principal) VALUES (?,?,?)',[reservationId,pid, pid===occupant_ids[0]]);
      }
    }
    await conn.commit();
    res.json({ id: reservationId });
  } catch(e){
    await conn.rollback();
    res.status(500).json({error:e.message});
  } finally { conn.release(); }
});

// Ajouter occupant
router.post('/:id/occupants', authenticate, requireWrite('reservations'), async (req,res)=>{
  const { personne_id } = req.body;
  const reservationId= req.params.id;
  const [[resv]]= await pool.query('SELECT * FROM reservations_hotel WHERE id=?',[reservationId]);
  if(!resv) return res.status(404).json({error:'Reservation non trouvée'});
  const [cnt]= await pool.query('SELECT COUNT(*) as c FROM reservation_occupants WHERE reservation_id=?',[reservationId]);
  if(cnt[0].c >= resv.capacite_max) return res.status(400).json({error:`Capacité max ${resv.capacite_max} atteinte`});
  await pool.query('INSERT INTO reservation_occupants (reservation_id,personne_id) VALUES (?,?)',[reservationId,personne_id]);
  res.json({ message:'occupant ajouté' });
});

// Retirer occupant avec vérif alerte chambre sous-occupée
router.delete('/:id/occupants/:personneId', authenticate, requireWrite('reservations'), async (req,res)=>{
  const { id, personneId } = req.params;
  const conn= await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM reservation_occupants WHERE reservation_id=? AND personne_id=?',[id,personneId]);
    const [cnt]= await conn.query('SELECT COUNT(*) as c FROM reservation_occupants WHERE reservation_id=?',[id]);
    const [[resv]]= await conn.query('SELECT * FROM reservations_hotel WHERE id=?',[id]);
    // Alerte si double/triple avec 1 seule personne restante
    if(cnt[0].c===1 && ['double','triple'].includes(resv.type_chambre)){
      const message = `Chambre ${resv.numero_chambre||resv.id} (${resv.type_chambre}) à l'hôtel ID ${resv.hotel_id} n'a plus qu'1 occupant. Suggéré: changer en single pour réduire frais.`;
      await conn.query('INSERT INTO hotel_alerts (event_id,reservation_id,type_alerte,message) VALUES (?,?,?,?)',[resv.event_id,id,'chambre_sous_occupee',message]);
      await conn.query('INSERT INTO notifications (event_id,type,titre,message) VALUES (?,?,?,?)',[resv.event_id,'hotel','Alerte chambre sous-occupée',message]);
      await conn.commit();
      return res.json({ message:'retiré', alerte: message });
    }
    await conn.commit();
    res.json({ message:'retiré' });
  } catch(e){
    await conn.rollback();
    res.status(500).json({error:e.message});
  } finally { conn.release(); }
});

router.put('/:id', authenticate, requireWrite('reservations'), async (req,res)=>{
  const { hotel_id, type_chambre, numero_chambre, capacite_max, prix_nuit, nb_nuits, date_arrivee, date_depart, statut, notes } = req.body;
  await pool.query(
    `UPDATE reservations_hotel SET hotel_id=?, type_chambre=?, numero_chambre=?, capacite_max=?, prix_nuit=?, nb_nuits=?, date_arrivee=?, date_depart=?, statut=?, notes=? WHERE id=?`,
    [hotel_id, type_chambre, numero_chambre||null, capacite_max||(type_chambre==='single'?1:type_chambre==='double'?2:3), prix_nuit||0, nb_nuits||1, date_arrivee||null, date_depart||null, statut||'reservee', notes||null, req.params.id]
  );
  res.json({ message: 'ok' });
});

router.delete('/:id', authenticate, requireWrite('reservations'), async (req,res)=>{
  await pool.query('DELETE FROM reservations_hotel WHERE id=?',[req.params.id]);
  res.json({ message:'supprimé' });
});

// Alertes
router.get('/event/:eventId/alerts', authenticate, requireRead('reservations','dashboard'), async (req,res)=>{
  const [rows]= await pool.query('SELECT * FROM hotel_alerts WHERE event_id=? ORDER BY created_at DESC',[req.params.eventId]);
  res.json(rows);
});

export default router;
