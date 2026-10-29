import express from 'express';
import pool from '../config/db.js';
import { authenticate, requireRead, requireWrite } from '../middleware/auth.js';
const router = express.Router();

const occupantSources={personnes:{table:'personnes',column:'personne_id'},equipe:{table:'employes',column:'employe_id'},intervenants:{table:'intervenants',column:'intervenant_id'}};
const inputError=message=>Object.assign(new Error(message),{status:400});
async function validateOccupants(conn,eventId,refs,capacity){
  if(!Array.isArray(refs))throw inputError('Liste des occupants invalide');
  const unique=[...new Set(refs.map(String))];
  if(unique.length>capacity)throw inputError(`Capacité maximale : ${capacity} occupant(s)`);
  const rows=[];
  for(const ref of unique){
    const match=/^(personnes|equipe|intervenants):([1-9]\d*)$/.exec(ref);
    if(!match)throw inputError('Occupant invalide');
    const source=occupantSources[match[1]],id=Number(match[2]);
    const [[person]]=await conn.query(`SELECT id FROM ${source.table} WHERE id=? AND event_id=?`,[id,eventId]);
    if(!person)throw inputError('Occupant introuvable dans cet événement');
    rows.push({column:source.column,id});
  }
  return rows;
}
router.get('/event/:eventId/candidates',authenticate,requireRead('reservations'),async(req,res)=>{
  const tokens=String(req.query.q||'').trim().slice(0,100).split(/\s+/).filter(Boolean);
  if(!tokens.length)return res.json([]);
  const terms=tokens.map(()=>"CONCAT_WS(' ',nom,prenom) LIKE ?").join(' AND ');
  const patterns=tokens.map(t=>'%'+t.replace(/[\\%_]/g,'\\$&')+'%');
  const params=[],queries=[];
  for(const [source,{table}] of Object.entries(occupantSources)){
    queries.push(`SELECT id,nom,prenom,'${source}' AS source,${source==='personnes'?'type':"'"+source+"'"} AS type FROM ${table} WHERE event_id=? AND ${terms}`);
    params.push(req.params.eventId,...patterns);
  }
  const [rows]=await pool.query(queries.join(' UNION ALL ')+' ORDER BY nom,prenom,source,id LIMIT 30',params);
  res.json(rows.map(p=>({...p,key:p.source+':'+p.id})));
});

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
    SELECT rh.*, DATE_FORMAT(rh.date_arrivee,'%Y-%m-%d') AS date_arrivee, DATE_FORMAT(rh.date_depart,'%Y-%m-%d') AS date_depart, h.nom as hotel_nom, h.wilaya_id AS hotel_wilaya_id, h.adresse AS hotel_adresse, h.telephone AS hotel_telephone, h.email AS hotel_email FROM reservations_hotel rh JOIN hotels h ON h.id=rh.hotel_id WHERE rh.id=?`, [req.params.id]);
  if(!resv.length) return res.status(404).json({error:'Non trouvé'});
  const [occupants]= await pool.query(`
    SELECT ro.*, COALESCE(p.nom,e.nom,i.nom) AS nom, COALESCE(p.prenom,e.prenom,i.prenom) AS prenom,
      COALESCE(p.email,e.email,i.email) AS email,
      CASE WHEN ro.employe_id IS NOT NULL THEN 'equipe' WHEN ro.intervenant_id IS NOT NULL THEN 'intervenants' ELSE p.type END AS type,
      CASE WHEN ro.employe_id IS NOT NULL THEN 'equipe' WHEN ro.intervenant_id IS NOT NULL THEN 'intervenants' ELSE 'personnes' END AS source
    FROM reservation_occupants ro
    LEFT JOIN personnes p ON p.id=ro.personne_id
    LEFT JOIN employes e ON e.id=ro.employe_id
    LEFT JOIN intervenants i ON i.id=ro.intervenant_id
    WHERE ro.reservation_id=?`, [req.params.id]);
  res.json({ ...resv[0], occupants });
});

router.post('/', authenticate, requireWrite('reservations'), async (req,res)=>{
  const { event_id, hotel_id, hotel_nom, hotel_wilaya_id, hotel_adresse, hotel_telephone, hotel_email, type_chambre, numero_chambre, capacite_max, prix_nuit, nb_nuits, date_arrivee, date_depart, statut, notes, occupant_ids, occupant_refs } = req.body;
  if(!event_id||(!hotel_id && !hotel_nom)||!type_chambre) return res.status(400).json({error:'Hôtel, type de chambre et événement requis'});
  const conn= await pool.getConnection();
  try {
    await conn.beginTransaction();
    const capacity=Number(capacite_max||({single:1,double:2,triple:3,suite:2,appartement:4}[type_chambre]||1));
    if(!Number.isInteger(capacity)||capacity<1||capacity>100)throw inputError('Capacité invalide');
    const refs=occupant_refs??(Array.isArray(occupant_ids)?occupant_ids.map(id=>'personnes:'+id):[]);
    const selected=await validateOccupants(conn,event_id,refs,capacity);
    let resolvedHotelId = hotel_id || null;
    if(!resolvedHotelId){
      const [existing] = await conn.query('SELECT id FROM hotels WHERE nom=? AND (wilaya_id=? OR ? IS NULL) LIMIT 1',[hotel_nom,hotel_wilaya_id||null,hotel_wilaya_id||null]);
      if(existing.length) resolvedHotelId=existing[0].id;
      else {
        const [hotelResult]=await conn.query('INSERT INTO hotels (nom,wilaya_id,adresse,telephone,email) VALUES (?,?,?,?,?)',[hotel_nom,hotel_wilaya_id||1,hotel_adresse||null,hotel_telephone||null,hotel_email||null]);
        resolvedHotelId=hotelResult.insertId;
      }
    }
    const [result]= await conn.query(
      `INSERT INTO reservations_hotel (event_id,hotel_id,type_chambre,numero_chambre,capacite_max,prix_nuit,nb_nuits,date_arrivee,date_depart,statut,notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [event_id,resolvedHotelId,type_chambre,numero_chambre||null,capacity,prix_nuit||0,nb_nuits||1,date_arrivee||null,date_depart||null,statut||'reservee',notes||null]
    );
    const reservationId = result.insertId;
    for(let index=0;index<selected.length;index++){
      const item=selected[index];
      await conn.query(`INSERT INTO reservation_occupants (reservation_id,${item.column},est_principal) VALUES (?,?,?)`,[reservationId,item.id,index===0?1:0]);
    }
    await conn.commit();
    res.json({ id: reservationId });
  } catch(e){
    await conn.rollback();
    res.status(e.status||500).json({error:e.message});
  } finally { conn.release(); }
});

// Ajouter occupant
router.post('/:id/occupants', authenticate, requireWrite('reservations'), async (req,res)=>{
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const [[reservation]]=await conn.query("SELECT *, DATE_FORMAT(date_arrivee,'%Y-%m-%d') AS date_arrivee, DATE_FORMAT(date_depart,'%Y-%m-%d') AS date_depart FROM reservations_hotel WHERE id=? FOR UPDATE",[req.params.id]);
    if(!reservation){await conn.rollback();return res.status(404).json({error:'Réservation introuvable'});}
    const [[count]]=await conn.query('SELECT COUNT(*) AS total FROM reservation_occupants WHERE reservation_id=?',[reservation.id]);
    const selected=await validateOccupants(conn,reservation.event_id,[req.body.occupant_ref||('personnes:'+req.body.personne_id)],reservation.capacite_max-Number(count.total));
    const item=selected[0];
    await conn.query(`INSERT INTO reservation_occupants (reservation_id,${item.column}) VALUES (?,?)`,[reservation.id,item.id]);
    await conn.commit();res.json({message:'Occupant ajouté'});
  }catch(e){await conn.rollback();res.status(e.code==='ER_DUP_ENTRY'?409:(e.status||500)).json({error:e.code==='ER_DUP_ENTRY'?'Occupant déjà présent':e.message});}
  finally{conn.release();}
});

// Retirer occupant avec vérif alerte chambre sous-occupée
router.delete('/:id/occupants/:personneId', authenticate, requireWrite('reservations'), async (req,res)=>{
  const { id, personneId } = req.params;
  const conn= await pool.getConnection();
  try {
    await conn.beginTransaction();
    const ref=String(personneId).includes(':')?String(personneId):'personnes:'+personneId;
    const match=/^(personnes|equipe|intervenants):([1-9]\d*)$/.exec(ref);
    if(!match)throw inputError('Occupant invalide');
    await conn.query(`DELETE FROM reservation_occupants WHERE reservation_id=? AND ${occupantSources[match[1]].column}=?`,[id,Number(match[2])]);
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
    res.status(e.status||500).json({error:e.message});
  } finally { conn.release(); }
});

router.put('/:id', authenticate, requireWrite('reservations'), async (req,res)=>{
 const conn=await pool.getConnection();
 try{
  await conn.beginTransaction();
  const [[old]]=await conn.query("SELECT *, DATE_FORMAT(date_arrivee,'%Y-%m-%d') AS date_arrivee, DATE_FORMAT(date_depart,'%Y-%m-%d') AS date_depart FROM reservations_hotel WHERE id=? FOR UPDATE",[req.params.id]);
  if(!old){await conn.rollback();return res.status(404).json({error:'Réservation introuvable'});}
  const data={...old,...req.body};
  if(!['single','double','triple','suite','appartement'].includes(data.type_chambre))throw inputError('Type de chambre invalide');
  const capacity=Number(data.capacite_max||({single:1,double:2,triple:3,suite:2,appartement:4}[data.type_chambre]));
  if(!Number.isInteger(capacity)||capacity<1||capacity>100)throw inputError('Capacité invalide');
  const price=Number(data.prix_nuit),nights=Number(data.nb_nuits);
  if(!Number.isFinite(price)||price<0)throw inputError('Prix par nuit invalide');
  if(!Number.isInteger(nights)||nights<1)throw inputError('Nombre de nuits invalide');
  if(!['reservee','confirmee','occupee','liberee','annulee'].includes(data.statut))throw inputError('Statut invalide');
  for(const key of ['date_arrivee','date_depart']){
   if(data[key] instanceof Date)data[key]=data[key].toISOString().slice(0,10);
   if(data[key]){
    const value=String(data[key]);const parsed=new Date(value+'T00:00:00Z');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)throw inputError('Date invalide');
   }
  }
  if(data.date_arrivee&&data.date_depart&&data.date_depart<data.date_arrivee)throw inputError('Le départ doit être après l’arrivée');
  const [previous]=await conn.query('SELECT id,personne_id,employe_id,intervenant_id FROM reservation_occupants WHERE reservation_id=?',[old.id]);
  const refOf=p=>p.employe_id?'equipe:'+p.employe_id:p.intervenant_id?'intervenants:'+p.intervenant_id:'personnes:'+p.personne_id;
  const refs=req.body.occupant_refs??(Array.isArray(req.body.occupant_ids)?req.body.occupant_ids.map(id=>'personnes:'+id):previous.map(refOf));
  const selected=await validateOccupants(conn,old.event_id,refs,capacity);
  let hotelId=old.hotel_id;
  if(Object.hasOwn(req.body,'hotel_nom')){
   const name=String(req.body.hotel_nom||'').trim();if(!name||name.length>200)throw inputError('Nom de l’hôtel requis (200 caractères maximum)');
   const [[hotel]]=await conn.query('SELECT * FROM hotels WHERE id=?',[old.hotel_id]);
   if(!hotel)throw inputError('Hôtel introuvable');
   const wilaya=Number(req.body.hotel_wilaya_id||hotel.wilaya_id);
   const [[region]]=await conn.query('SELECT id FROM wilayas WHERE id=?',[wilaya]);if(!region)throw inputError('Wilaya de l’hôtel invalide');
   const text=(key,fallback)=>Object.hasOwn(req.body,key)?String(req.body[key]||'').trim()||null:fallback||null;
   const address=text('hotel_adresse',hotel.adresse),phone=text('hotel_telephone',hotel.telephone),email=text('hotel_email',hotel.email);
   if(name!==hotel.nom||wilaya!==Number(hotel.wilaya_id)||address!==(hotel.adresse||null)||phone!==(hotel.telephone||null)||email!==(hotel.email||null)){
    // A hotel can be shared by other reservations: do not change it globally.
    const [[match]]=await conn.query('SELECT id FROM hotels WHERE nom=? AND wilaya_id=? AND adresse <=> ? AND telephone <=> ? AND email <=> ? LIMIT 1',[name,wilaya,address,phone,email]);
    if(match)hotelId=match.id;
    else{const [created]=await conn.query('INSERT INTO hotels (nom,wilaya_id,adresse,telephone,email) VALUES (?,?,?,?,?)',[name,wilaya,address,phone,email]);hotelId=created.insertId;}
   }
  }else if(req.body.hotel_id){
   const [[hotel]]=await conn.query('SELECT id FROM hotels WHERE id=?',[req.body.hotel_id]);if(!hotel)throw inputError('Hôtel invalide');hotelId=hotel.id;
  }
  await conn.query('UPDATE reservations_hotel SET hotel_id=?,type_chambre=?,numero_chambre=?,capacite_max=?,prix_nuit=?,nb_nuits=?,date_arrivee=?,date_depart=?,statut=?,notes=? WHERE id=?',[hotelId,data.type_chambre,data.numero_chambre||null,capacity,price,nights,data.date_arrivee||null,data.date_depart||null,data.statut,data.notes||null,old.id]);
  const selectedKeys=new Set(selected.map(p=>p.column+':'+p.id));
  for(const item of previous){const column=item.employe_id?'employe_id':item.intervenant_id?'intervenant_id':'personne_id';if(!selectedKeys.has(column+':'+item[column]))await conn.query('DELETE FROM reservation_occupants WHERE id=? AND reservation_id=?',[item.id,old.id]);}
  for(let index=0;index<selected.length;index++){
   const item=selected[index],existing=previous.find(p=>Number(p[item.column])===item.id);
   if(existing)await conn.query('UPDATE reservation_occupants SET est_principal=? WHERE id=?',[index===0?1:0,existing.id]);
   else await conn.query(`INSERT INTO reservation_occupants (reservation_id,${item.column},est_principal) VALUES (?,?,?)`,[old.id,item.id,index===0?1:0]);
  }
  await conn.query('DELETE FROM hotel_alerts WHERE reservation_id=?',[old.id]);
  if(selected.length===1&&['double','triple'].includes(data.type_chambre))await conn.query('INSERT INTO hotel_alerts (event_id,reservation_id,type_alerte,message) VALUES (?,?,?,?)',[old.event_id,old.id,'chambre_sous_occupee',`Chambre ${data.numero_chambre||old.id} (${data.type_chambre}) : un seul occupant. Vérifiez le type de chambre.`]);
  await conn.commit();res.json({message:'Réservation modifiée',id:old.id});
 }catch(e){await conn.rollback();res.status(e.status||500).json({error:e.message});}
 finally{conn.release();}
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
