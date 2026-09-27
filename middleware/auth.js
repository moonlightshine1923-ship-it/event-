import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

export const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Token manquant' });
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [decoded.id]);
    if (!users.length || !users[0].is_active) return res.status(401).json({ error: 'Utilisateur invalide' });
    req.user = users[0];
    // parse permissions if string
    if (typeof req.user.permissions === 'string') {
      try { req.user.permissions = JSON.parse(req.user.permissions); } catch { req.user.permissions = {}; }
    }
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token invalide', details: e.message });
  }
};

// Normalize a role so "super_admin", "superAdmin", "Super_Admin", "SUPERADMIN" all match.
const normalizeRole = (r) => String(r || '').toLowerCase().replace(/[^a-z]/g, '');
export const isPrivilegedRole = (r) => {
  const n = normalizeRole(r);
  return n === 'superadmin' || n === 'admin' || n === 'administrator';
};

// Réservé au super admin (rôle admin exclu) — utilisé pour le journal d'audit
// et la suppression d'utilisateurs.
export const superOnly = (req, res, next) => {
  if (normalizeRole(req.user?.role) === 'superadmin') return next();
  return res.status(403).json({ error: 'Réservé au super admin' });
};

const isWriteMethod = (req) => !['GET', 'HEAD', 'OPTIONS'].includes(req.method);

// Accès en lecture à une rubrique : super_admin/admin passent toujours ;
// editor & viewer doivent avoir la rubrique dans leurs permissions.
export const requireRead = (...keys) => (req, res, next) => {
  if (isPrivilegedRole(req.user?.role)) return next();
  const p = req.user.permissions || {};
  if (p.all || keys.some(k => p[k])) return next();
  return res.status(403).json({ error: 'Rubrique non autorisée' });
};

// Accès en écriture (POST/PUT/DELETE) : interdit au rôle viewer (lecture seule),
// et limité aux rubriques sélectionnées pour le rôle editor.
export const requireWrite = (...keys) => (req, res, next) => {
  if (isPrivilegedRole(req.user?.role)) return next();
  if (normalizeRole(req.user?.role) === 'viewer') {
    return res.status(403).json({ error: 'Compte en lecture seule : ajout/modification/suppression interdits' });
  }
  const p = req.user.permissions || {};
  if (p.all || keys.some(k => p[k])) return next();
  return res.status(403).json({ error: 'Rubrique non autorisée' });
};

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    const ok = roles.length === 0
      || roles.includes(req.user.role)
      || isPrivilegedRole(req.user.role)
      || (req.user.permissions && (req.user.permissions.all || req.user.permissions.users));
    if (!ok) return res.status(403).json({ error: 'Accès refusé' });
    next();
  };
};

// Permission check granular
export const checkPermission = (permKey) => {
  return (req, res, next) => {
    if (req.user.role && isPrivilegedRole(req.user.role)) return next();
    const perms = req.user.permissions || {};
    if (perms[permKey] || perms['all']) return next();
    return res.status(403).json({ error: `Permission ${permKey} requise` });
  };
};