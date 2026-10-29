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
    "ALTER TABLE stands ADD COLUMN plan_slot INT NULL",
    "ALTER TABLE stands ADD UNIQUE KEY uq_stand_plan_slot (event_id,plan_slot)",
    `CREATE TABLE IF NOT EXISTS event_stand_shares (
      event_id INT PRIMARY KEY, token VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
      enabled BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    )`,
    "ALTER TABLE reservation_occupants MODIFY COLUMN personne_id INT NULL",
    "ALTER TABLE reservation_occupants ADD COLUMN employe_id INT NULL",
    "ALTER TABLE reservation_occupants ADD COLUMN intervenant_id INT NULL",
    "ALTER TABLE reservation_occupants ADD UNIQUE KEY uq_reservation_employe (reservation_id, employe_id)",
    "ALTER TABLE reservation_occupants ADD UNIQUE KEY uq_reservation_intervenant (reservation_id, intervenant_id)",
    "ALTER TABLE sponsors MODIFY COLUMN type ENUM('platinium','gold','silver','bronze','autre') NOT NULL DEFAULT 'autre'",
    "ALTER TABLE billets_avion ADD COLUMN passager_nom VARCHAR(150) NULL",
    "ALTER TABLE billets_avion ADD COLUMN passager_prenom VARCHAR(150) NULL",
    "ALTER TABLE billets_avion ADD COLUMN date_arrivee DATETIME NULL",
    "ALTER TABLE billets_avion ADD COLUMN date_arrivee_retour DATETIME NULL",
    "ALTER TABLE billets_avion ADD COLUMN aeroport_depart_retour VARCHAR(150) NULL",
    "ALTER TABLE billets_avion ADD COLUMN aeroport_arrivee_retour VARCHAR(150) NULL",
    "ALTER TABLE billets_avion MODIFY COLUMN personne_id INT NULL",
    `CREATE TABLE IF NOT EXISTS restauration_simple (
      event_id INT PRIMARY KEY, menu TEXT, achats TEXT, montant DECIMAL(14,2) NOT NULL DEFAULT 0,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS restauration_factures (
      id INT AUTO_INCREMENT PRIMARY KEY, event_id INT NOT NULL, nom VARCHAR(255), file_path VARCHAR(500) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    )`,
    // Rôles : suppression de manager/finance -> super_admin, admin, editor, viewer
    "ALTER TABLE users MODIFY COLUMN role VARCHAR(30) NOT NULL DEFAULT 'viewer'",
    "UPDATE users SET role='editor' WHERE role='manager'",
    "UPDATE users SET role='viewer' WHERE role='finance'",
    'ALTER TABLE hotels ADD COLUMN nb_chambres_single INT DEFAULT 0',
    'ALTER TABLE hotels ADD COLUMN nb_chambres_double INT DEFAULT 0',
    'ALTER TABLE hotels ADD COLUMN nb_chambres_suite INT DEFAULT 0',
    'ALTER TABLE events ADD COLUMN plan_photo VARCHAR(500)',
    'ALTER TABLE personnes ADD COLUMN fichier_path VARCHAR(500)',
    'ALTER TABLE personnes ADD COLUMN photo_path VARCHAR(500)',
    'ALTER TABLE exposants ADD COLUMN fichier_path VARCHAR(500)',
    'ALTER TABLE employes ADD COLUMN fichier_path VARCHAR(500)',
    'ALTER TABLE employes MODIFY COLUMN poste VARCHAR(150) NOT NULL',
    `CREATE TABLE IF NOT EXISTS postes_employes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      event_id INT NOT NULL,
      titre VARCHAR(150) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    )`,
    'ALTER TABLE employes ADD COLUMN nin VARCHAR(18) NULL',
    'ALTER TABLE employes ADD COLUMN categorie_id INT NULL',
    'ALTER TABLE employes ADD COLUMN responsable VARCHAR(255) NULL',
    'ALTER TABLE employes ADD COLUMN photo_path VARCHAR(500) NULL',
    'ALTER TABLE employes ADD COLUMN notes TEXT NULL',
    `CREATE TABLE IF NOT EXISTS equipe_categories (
      id INT AUTO_INCREMENT PRIMARY KEY, event_id INT NOT NULL, nom VARCHAR(150) NOT NULL,
      description TEXT, couleur VARCHAR(20) DEFAULT '#2f6bff', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_equipe_category (event_id, nom), FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS intervenants (
      id INT AUTO_INCREMENT PRIMARY KEY, event_id INT NOT NULL, nom VARCHAR(150) NOT NULL, prenom VARCHAR(150) NOT NULL,
      poste VARCHAR(150), telephone VARCHAR(50), email VARCHAR(255), photo_path VARCHAR(500), engagement_description TEXT,
      engagement_file_path VARCHAR(500), presentation_file_path VARCHAR(500), notes TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_intervenant (event_id, nom, prenom), FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    )`,
    'ALTER TABLE intervenants ADD UNIQUE KEY uq_intervenant (event_id, nom, prenom)',
    `INSERT IGNORE INTO intervenants (event_id,nom,prenom,poste,email,presentation_file_path)
      SELECT DISTINCT event_id, intervenant_nom, intervenant_prenom, intervenant_poste, intervenant_email, presentation_file
      FROM programmes WHERE intervenant_nom IS NOT NULL AND intervenant_nom<>''`,
    `CREATE TABLE IF NOT EXISTS autorisations (
      id INT AUTO_INCREMENT PRIMARY KEY, event_id INT NOT NULL, titre VARCHAR(255) NOT NULL, type VARCHAR(100) DEFAULT 'autre',
      organisme VARCHAR(255), date_demande DATE, date_obtention DATE, statut VARCHAR(50) DEFAULT 'a_demander', description TEXT, notes TEXT,
      file_path VARCHAR(500), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS event_documents (
      id INT AUTO_INCREMENT PRIMARY KEY, event_id INT NOT NULL, titre VARCHAR(255) NOT NULL, type VARCHAR(100) DEFAULT 'autre',
      date_document DATE, description TEXT, notes TEXT, file_path VARCHAR(500), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS finance_transactions (
      id INT AUTO_INCREMENT PRIMARY KEY, event_id INT NOT NULL, type ENUM('entrant','sortant') NOT NULL, categorie VARCHAR(100) DEFAULT 'autre',
      libelle VARCHAR(255) NOT NULL, montant DECIMAL(14,2) NOT NULL DEFAULT 0, date_transaction DATE, notes TEXT, created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )`,
    "INSERT IGNORE INTO equipe_categories (event_id,nom) SELECT DISTINCT event_id,poste FROM employes WHERE categorie_id IS NULL AND poste IS NOT NULL AND poste<>''",
    "UPDATE employes e JOIN equipe_categories c ON c.event_id=e.event_id AND c.nom=e.poste SET e.categorie_id=c.id WHERE e.categorie_id IS NULL"
  ];
  for (const sql of migrations) {
    try {
      await pool.query(sql);
    } catch (e) {
      if (![1060,1050,1061].includes(e.errno)) {
        console.error('❌ Migration échouée:', sql, e.message);
        throw e;
      }
    }
  }
  for(const [name,column,table] of [['fk_reservation_employe','employe_id','employes'],['fk_reservation_intervenant','intervenant_id','intervenants']]){
    const [found]=await pool.query('SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME=? AND CONSTRAINT_NAME=?',['reservation_occupants',name]);
    if(!found.length)await pool.query(`ALTER TABLE reservation_occupants ADD CONSTRAINT ${name} FOREIGN KEY (${column}) REFERENCES ${table}(id) ON DELETE CASCADE`);
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
    console.error('❌ MySQL / migration erreur:', err.message);
    throw err;
  }
};

export default pool;
