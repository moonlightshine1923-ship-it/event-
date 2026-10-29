import express from 'express';
import {randomBytes} from 'node:crypto';
import pool from '../config/db.js';
import {authenticate,requireRead,requireWrite} from '../middleware/auth.js';
import {syncStandPlan,readStandPlan} from '../services/stand-plan.js';
const router=express.Router();
const read=requireRead('exposants','stands'),write=requireWrite('exposants','stands');
const shareUrl=s=>s?'/plan-stands.html?code='+s.token:null;
router.get('/public/:token',async(req,res)=>{
 res.set('Cache-Control','no-store');res.set('X-Robots-Tag','noindex, nofollow');
 if(!/^[a-f0-9]{48}$/.test(req.params.token))return res.status(404).json({error:'Lien indisponible ou désactivé'});
 const [[share]]=await pool.query('SELECT sh.event_id,e.titre FROM event_stand_shares sh JOIN events e ON e.id=sh.event_id WHERE sh.token=? AND sh.enabled=1',[req.params.token]);
 if(!share)return res.status(404).json({error:'Lien indisponible ou désactivé'});
 const stands=await readStandPlan(pool,share.event_id);
 res.json({title:share.titre,columns:4,stands,updatedAt:new Date().toISOString()});
});
router.get('/event/:eventId',authenticate,read,async(req,res)=>{
 res.set('Cache-Control','no-store');
 const [[event]]=await pool.query('SELECT id,titre FROM events WHERE id=?',[req.params.eventId]);
 if(!event)return res.status(404).json({error:'Événement introuvable'});
 const stands=await readStandPlan(pool,event.id);
 const [[share]]=await pool.query('SELECT token,enabled FROM event_stand_shares WHERE event_id=?',[event.id]);
 res.json({title:event.titre,columns:4,stands,share:share?{enabled:!!share.enabled,url:shareUrl(share)}:{enabled:false,url:null}});
});
router.post('/event/:eventId/share',authenticate,write,async(req,res)=>{
 const conn=await pool.getConnection();
 try{
  await conn.beginTransaction();await syncStandPlan(conn,req.params.eventId);
  const [[old]]=await conn.query('SELECT token FROM event_stand_shares WHERE event_id=?',[req.params.eventId]);
  const token=old?.token||randomBytes(24).toString('hex');
  await conn.query('INSERT INTO event_stand_shares (event_id,token,enabled) VALUES (?,?,1) ON DUPLICATE KEY UPDATE enabled=1',[req.params.eventId,token]);
  await conn.commit();res.json({enabled:true,url:shareUrl({token})});
 }catch(e){await conn.rollback();throw e;}finally{conn.release();}
});
router.delete('/event/:eventId/share',authenticate,write,async(req,res)=>{
 await pool.query('UPDATE event_stand_shares SET enabled=0 WHERE event_id=?',[req.params.eventId]);res.json({enabled:false});
});
router.put('/event/:eventId/position',authenticate,write,async(req,res)=>{
 const {stand_id,slot}=req.body;
 if(!Number.isInteger(slot)||slot<0||slot>999||!Number.isInteger(stand_id)||stand_id<1)return res.status(400).json({error:'Emplacement invalide'});
 const conn=await pool.getConnection();
 try{
  await conn.beginTransaction();await syncStandPlan(conn,req.params.eventId);
  const [[stand]]=await conn.query('SELECT id,plan_slot FROM stands WHERE event_id=? AND id=? AND exposant_id IS NOT NULL',[req.params.eventId,stand_id]);
  if(!stand){await conn.rollback();return res.status(404).json({error:'Stand introuvable dans cet événement'});}
  const [[other]]=await conn.query('SELECT id FROM stands WHERE event_id=? AND plan_slot=?',[req.params.eventId,slot]);
  if(Number(stand.plan_slot)!==slot){
   await conn.query('UPDATE stands SET plan_slot=NULL WHERE id=?',[stand.id]);
   if(other)await conn.query('UPDATE stands SET plan_slot=? WHERE id=?',[stand.plan_slot,other.id]);
   await conn.query('UPDATE stands SET plan_slot=? WHERE id=?',[slot,stand.id]);
  }
  await conn.commit();res.json({message:'Emplacement enregistré'});
 }catch(e){await conn.rollback();throw e;}finally{conn.release();}
});
export default router;
