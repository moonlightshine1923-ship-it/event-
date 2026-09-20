import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

import pool, { testConnection } from './config/db.js';
import authRoutes from './routes/auth.js';
import wilayaRoutes from './routes/wilayas.js';
import rubriqueRoutes from './routes/rubriques.js';
import hotelRoutes from './routes/hotels.js';
import eventRoutes from './routes/events.js';
import personneRoutes from './routes/personnes.js';
import exposantRoutes from './routes/exposants.js';
import standRoutes from './routes/stands.js';
import employeRoutes from './routes/employes.js';
import sponsorRoutes from './routes/sponsors.js';
import restaurationRoutes from './routes/restauration.js';
import conventionRoutes from './routes/conventions.js';
import billetRoutes from './routes/billets.js';
import reservationRoutes from './routes/reservations.js';
import programmeRoutes from './routes/programme.js';
import notificationRoutes from './routes/notifications.js';
import { auditMiddleware, getAuditLogs } from './middleware/audit.js';
import { authenticate } from './middleware/auth.js';

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true }));

// Ensure upload dirs
['uploads','uploads/presentations','uploads/billets','uploads/conventions','uploads/sponsors'].forEach(d=>{
  if(!fs.existsSync(d)) fs.mkdirSync(d, { recursive:true });
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// API routes - tous avant fallback
app.use('/api/auth', authRoutes);
app.use('/api/wilayas', wilayaRoutes);
app.use('/api/rubriques', rubriqueRoutes);
app.use('/api/hotels', hotelRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/personnes', personneRoutes);
app.use('/api/exposants', exposantRoutes);
app.use('/api/stands', standRoutes);
app.use('/api/employes', employeRoutes);
app.use('/api/sponsors', sponsorRoutes);
app.use('/api/restauration', restaurationRoutes);
app.use('/api/conventions', conventionRoutes);
app.use('/api/billets', billetRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/programmes', programmeRoutes);
app.use('/api/notifications', notificationRoutes);

app.get('/api/audit-logs', authenticate, getAuditLogs);

// Health
app.get('/api/health', async (req,res)=>{
  try {
    const [rows]= await pool.query('SELECT 1 as ok');
    res.json({ status:'ok', db: rows[0].ok===1?'connected':'error', time: new Date() });
  } catch(e){
    res.status(500).json({ status:'error', error:e.message });
  }
});

// Audit middleware - après routes mais avant 404
app.use(auditMiddleware);

// Scripts injectés par Cloudflare (bot-management / Turnstile). Sur localhost ils
// n'existent pas ; on renvoie un JS valide (vide) pour éviter les erreurs console
// "Unexpected token '<'" / "404 ERR_ABORTED" sur /cdn-cgi/.../main.js
app.use('/cdn-cgi', (req, res) => {
  res.type('application/javascript').send('/* Cloudflare script non disponible en local */');
});

// 404 pour API uniquement (pas de wildcard *)
app.use((req, res, next) => {
  if (req.originalUrl.startsWith('/api')) {
    return res.status(404).json({error:'Route API non trouvée: '+req.originalUrl});
  }
  next();
});

// Fallback SPA - SANS wildcard pour Express 5 (app.use sans path)
// Cela évite complètement path-to-regexp
app.use((req, res) => {
  if (req.method !== 'GET') return res.status(404).json({error:'Non trouvé'});
  // Ne JAMAIS renvoyer index.html pour une ressource statique (fichier .js/.css/...).
  // Sinon le navigateur reçoit du HTML là où il attend du JS -> "Unexpected token '<'".
  if (path.extname(req.path)) return res.status(404).json({error:'Ressource introuvable: '+req.path});
  return res.sendFile(path.join(__dirname,'public','index.html'));
});

// Error handler
app.use((err, req, res, next)=>{
  console.error(err);
  res.status(err.status||500).json({ error: err.message||'Erreur serveur' });
});

app.listen(PORT, async ()=>{
  console.log(`🚀 Serveur Event Manager sur http://localhost:${PORT}`);
  await testConnection();
});
