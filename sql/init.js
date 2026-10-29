import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  port: process.env.DB_PORT || 3306,
  multipleStatements: true
};

const dbName = process.env.DB_NAME || 'event_manager_db';

async function init() {
  console.log('🔧 Init DB:', dbName, 'sur', config.host);
  let conn;
  try {
    conn = await mysql.createConnection(config);
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`✅ Database ${dbName} créée / existe`);
    await conn.query(`USE \`${dbName}\``);

    const schemaPath = path.join(__dirname, 'schema.sql');
    const seedPath = path.join(__dirname, 'seed_wilayas.sql');

    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, 'utf8');
      // Remove CREATE DATABASE line already executed to avoid error if USE already
      const cleaned = schema.replace(/CREATE DATABASE[\s\S]*?;/i, '').replace(/USE [\s\S]*?;/i, '');
      const statements = cleaned.split(';').filter(s => s.trim().length > 20);
      for (const stmt of statements) {
        if (stmt.trim()) {
          try {
            await conn.query(stmt);
          } catch (e) {
            // Ignore errors for already exists etc, but log
            if (![1050,1061].includes(e.errno)) throw e;
          }
        }
      }
      console.log('✅ Schema importé');
    }

    if (fs.existsSync(seedPath)) {
      const seed = fs.readFileSync(seedPath, 'utf8');
      try {
        await conn.query(seed);
        console.log('✅ 58 Wilayas seedées');
      } catch (e) {
        console.log('⚠️ Seed warning (peut-être déjà inséré):', e.message.substring(0,200));
      }
    }

    const { runAutoMigrations, default: pool } = await import('../config/db.js');
    try { await runAutoMigrations(); console.log('✅ Mise à niveau des tables existantes complétée'); } finally { await pool.end(); }
    console.log('🎉 Init terminé avec succès');
  } catch (e) {
    console.error('❌ Erreur init:', e.message);
    console.error(e.stack);
    process.exitCode = 1;
  } finally {
    if (conn) await conn.end();
  }
}

init();
