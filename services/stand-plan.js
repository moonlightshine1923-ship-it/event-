// The caller owns the transaction. Locking the event serializes allocation and moves.
export async function syncStandPlan(conn,eventId){
 const [[event]]=await conn.query('SELECT id,titre FROM events WHERE id=? FOR UPDATE',[eventId]);
 if(!event)throw Object.assign(new Error('Événement introuvable'),{status:404});
 const [stands]=await conn.query('SELECT id,numero,plan_slot,exposant_id,statut FROM stands WHERE event_id=? ORDER BY id FOR UPDATE',[eventId]);
 const occupied=new Set(stands.filter(s=>s.plan_slot!==null).map(s=>Number(s.plan_slot))),numbers=new Set(stands.map(s=>s.numero));
 function nextSlot(){let i=0;while(occupied.has(i))i++;if(i>999)throw Object.assign(new Error('Le plan est limité à 1 000 emplacements'),{status:400});occupied.add(i);return i;}
 for(const stand of stands)if(stand.plan_slot===null){stand.plan_slot=nextSlot();await conn.query('UPDATE stands SET plan_slot=? WHERE id=?',[stand.plan_slot,stand.id]);}
 const [missing]=await conn.query('SELECT ex.id FROM exposants ex LEFT JOIN stands s ON s.exposant_id=ex.id AND s.event_id=ex.event_id WHERE ex.event_id=? AND s.id IS NULL ORDER BY ex.id',[eventId]);
 const available=stands.filter(s=>!s.exposant_id&&s.statut==='libre');
 for(const ex of missing){
  const free=available.shift();
  if(free){await conn.query("UPDATE stands SET exposant_id=?,statut='occupe' WHERE id=?",[ex.id,free.id]);continue;}
  let n=1;while(numbers.has(`S-${String(n).padStart(3,'0')}`))n++;
  const numero=`S-${String(n).padStart(3,'0')}`,slot=nextSlot();numbers.add(numero);
  await conn.query("INSERT INTO stands (event_id,numero,zone,taille,statut,exposant_id,pos_x,pos_y,width,height,plan_slot) VALUES (?,?,'A','3x3','occupe',?,?,?,220,125,?)",[eventId,numero,ex.id,(slot%4)*240+20,Math.floor(slot/4)*150+20,slot]);
 }
 return event;
}
export async function readStandPlan(db,eventId){
 const [rows]=await db.query(`SELECT s.id,s.numero,s.plan_slot AS slot,p.entreprise AS company
  FROM stands s JOIN exposants ex ON ex.id=s.exposant_id AND ex.event_id=s.event_id
  JOIN personnes p ON p.id=ex.personne_id AND p.event_id=ex.event_id WHERE s.event_id=? ORDER BY s.id`,[eventId]);
 const used=new Set(rows.filter(s=>s.slot!==null).map(s=>Number(s.slot)));
 return rows.map(s=>{let slot=s.slot;if(slot===null){slot=0;while(used.has(slot))slot++;used.add(slot);}return {id:s.id,numero:s.numero,slot:Number(slot),company:String(s.company||'').trim()||'Société à renseigner'};}).sort((a,b)=>a.slot-b.slot);
}
