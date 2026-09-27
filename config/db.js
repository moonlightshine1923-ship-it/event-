import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'event_manager_db',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  enableKeepAlive: true
});

// Auto-migrate schema updates safely
export const runAutoMigrations = async () => {
  const migrations = [
    // Rôles : suppression de manager/finance -> super_admin, admin, editor, viewer
    "ALTER TABLE users MODIFY COLUMN role VARCHAR(30) NOT NULL DEFAULT 'viewer'",
    "UPDATE users SET role='editor' WHERE role='manager'",
    "UPDATE users SET role='viewer' WHERE role='finance'",
    'ALTER TABLE hotels ADD COLUMN nb_chambres_single INT DEFAULT 0',
    'ALTER TABLE hotels ADD COLUMN nb_chambres_double INT DEFAULT 0',
    'ALTER TABLE hotels ADD COLUMN nb_chambres_suite INT DEFAULT 0',
    'ALTER TABLE events ADD COLUMN plan_photo VARCHAR(500)',
    'ALTER TABLE personnes ADD COLUMN fichier_path VARCHAR(500)',
    'ALTER TABLE exposants ADD COLUMN fichier_path VARCHAR(500)',
    'ALTER TABLE employes ADD COLUMN fichier_path VARCHAR(500)',
    'ALTER TABLE employes MODIFY COLUMN poste VARCHAR(150) NOT NULL',
    `CREATE TABLE IF NOT EXISTS postes_employes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      event_id INT NOT NULL,
      titre VARCHAR(150) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    )`
  ];
  for (const sql of migrations) {
    try {
      await pool.query(sql);
    } catch (e) {
      // Ignore "Duplicate column name" (1060) or "Table already exists" (1050)
      if (!e.message.includes('Duplicate column') && !e.message.includes('already exists') && e.errno !== 1060 && e.errno !== 1050) {
        // console.warn('Migration note:', e.message.substring(0, 100));
      }
    }
  }
};

// Test connection
export const testConnection = async () => {
  try {
    const conn = await pool.getConnection();
    console.log('✅ MySQL connecté');
    conn.release();
    await runAutoMigrations();
    console.log('✅ Auto-migrations DB complétées');
  } catch (err) {
    console.error('❌ MySQL erreur:', err.message);
  }
};

export default pool;
