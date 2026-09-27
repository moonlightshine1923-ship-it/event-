-- Event Manager Algeria - Schema complet
-- 58 Wilayas, Hotels, Events, Personnes, Exposants, Stands, Employés, Sponsors, Restauration, Conventions, Billets, Réservations, Programme, Users, Audit

CREATE DATABASE IF NOT EXISTS event_manager_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE event_manager_db;

-- 1. WILAYAS
CREATE TABLE IF NOT EXISTS wilayas (
  id INT PRIMARY KEY,
  code VARCHAR(10) UNIQUE NOT NULL,
  nom VARCHAR(100) NOT NULL,
  nom_ar VARCHAR(100)
);

-- 2. USERS & PERMISSIONS
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(30) NOT NULL DEFAULT 'viewer', -- super_admin | admin | editor (lecture/ecriture) | viewer (lecture seule)
  permissions JSON,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 3. RUBRIQUES
CREATE TABLE IF NOT EXISTS rubriques (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nom VARCHAR(150) NOT NULL,
  description TEXT,
  couleur VARCHAR(20) DEFAULT '#0d6efd',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. HOTELS
CREATE TABLE IF NOT EXISTS hotels (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nom VARCHAR(200) NOT NULL,
  wilaya_id INT NOT NULL,
  adresse TEXT,
  etoiles TINYINT DEFAULT 3,
  telephone VARCHAR(30),
  email VARCHAR(255),
  site_web VARCHAR(255),
  nb_chambres_single INT DEFAULT 0,
  nb_chambres_double INT DEFAULT 0,
  nb_chambres_suite INT DEFAULT 0,
  prix_moyen DECIMAL(12,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (wilaya_id) REFERENCES wilayas(id) ON DELETE CASCADE
);

-- 5. EVENTS (ÉVÉNEMENTS)
CREATE TABLE IF NOT EXISTS events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rubrique_id INT,
  titre VARCHAR(255) NOT NULL,
  theme VARCHAR(255),
  description TEXT,
  emplacement VARCHAR(255),
  wilaya_id INT,
  date_debut DATE,
  date_fin DATE,
  heure_debut TIME,
  heure_fin TIME,
  budget_initial DECIMAL(14,2) DEFAULT 0,
  nb_personnes_prevu INT DEFAULT 0,
  nb_invites INT DEFAULT 0,
  nb_exposants_prevu INT DEFAULT 0,
  nb_vip_prevu INT DEFAULT 0,
  statut ENUM('brouillon','planifie','en_cours','termine','annule') DEFAULT 'brouillon',
  plan_photo VARCHAR(500),
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (rubrique_id) REFERENCES rubriques(id) ON DELETE SET NULL,
  FOREIGN KEY (wilaya_id) REFERENCES wilayas(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 6. PERSONNES (tous participants)
CREATE TABLE IF NOT EXISTS personnes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_id INT NOT NULL,
  type ENUM('exposant','invite_vip','invite_normal','autre') NOT NULL,
  type_custom VARCHAR(100),
  nom VARCHAR(150) NOT NULL,
  prenom VARCHAR(150) NOT NULL,
  email VARCHAR(255),
  telephone VARCHAR(50),
  entreprise VARCHAR(255),
  poste VARCHAR(150),
  pays VARCHAR(100) DEFAULT 'Algérie',
  wilaya_id INT,
  notes TEXT,
  fichier_path VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (wilaya_id) REFERENCES wilayas(id) ON DELETE SET NULL
);

-- 7. EXPOSANTS (détails)
CREATE TABLE IF NOT EXISTS exposants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  personne_id INT UNIQUE NOT NULL,
  event_id INT NOT NULL,
  fiche_technique TEXT,
  convoque_par VARCHAR(255),
  domaine_activite VARCHAR(255),
  numero_stand VARCHAR(50),
  superficie_demandee VARCHAR(50),
  a_paye BOOLEAN DEFAULT FALSE,
  methode_paiement ENUM('especes','virement','cheque','versement','carte','autre'),
  montant_paye DECIMAL(12,2) DEFAULT 0,
  montant_restant DECIMAL(12,2) DEFAULT 0,
  date_paiement DATE,
  besoins_speciaux TEXT,
  fichier_path VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (personne_id) REFERENCES personnes(id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

-- 8. STANDS
CREATE TABLE IF NOT EXISTS stands (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_id INT NOT NULL,
  numero VARCHAR(20) NOT NULL,
  zone VARCHAR(50) DEFAULT 'A',
  taille VARCHAR(50),
  superficie DECIMAL(8,2),
  pos_x INT DEFAULT 0,
  pos_y INT DEFAULT 0,
  width INT DEFAULT 100,
  height INT DEFAULT 100,
  statut ENUM('libre','reserve','occupe','indisponible') DEFAULT 'libre',
  exposant_id INT,
  prix DECIMAL(12,2) DEFAULT 0,
  equipements TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (exposant_id) REFERENCES exposants(id) ON DELETE SET NULL,
  UNIQUE(event_id, numero)
);

-- 9. EMPLOYES
CREATE TABLE IF NOT EXISTS employes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_id INT NOT NULL,
  nom VARCHAR(150) NOT NULL,
  prenom VARCHAR(150) NOT NULL,
  poste VARCHAR(150) NOT NULL,
  poste_custom VARCHAR(150),
  telephone VARCHAR(50),
  email VARCHAR(255),
  tache TEXT,
  lieu_affectation VARCHAR(255),
  date_debut DATE,
  date_fin DATE,
  salaire_jour DECIMAL(10,2) DEFAULT 0,
  nb_jours INT DEFAULT 1,
  salaire_total DECIMAL(12,2) GENERATED ALWAYS AS (salaire_jour * nb_jours) STORED,
  statut_paiement ENUM('non_paye','paye','partiel') DEFAULT 'non_paye',
  fichier_path VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS postes_employes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_id INT NOT NULL,
  titre VARCHAR(150) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

-- 10. SPONSORS
CREATE TABLE IF NOT EXISTS sponsors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_id INT NOT NULL,
  nom VARCHAR(255) NOT NULL,
  type ENUM('platinium','gold','silver','bronze') NOT NULL,
  montant DECIMAL(12,2) DEFAULT 0,
  entreprise VARCHAR(255),
  contact_nom VARCHAR(255),
  contact_email VARCHAR(255),
  contact_tel VARCHAR(50),
  logo_path VARCHAR(500),
  avantages TEXT,
  statut_paiement ENUM('en_attente','paye','partiel') DEFAULT 'en_attente',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

-- 11. RESTAURATION CONFIG
CREATE TABLE IF NOT EXISTS restauration_configs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_id INT UNIQUE NOT NULL,
  nb_salles_vip INT DEFAULT 1,
  nb_salles_normales INT DEFAULT 1,
  capacite_salle_vip INT DEFAULT 50,
  capacite_salle_normale INT DEFAULT 200,
  notes TEXT,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS restauration_menus (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_id INT NOT NULL,
  type_repas ENUM('petit_dej','dejeuner','diner','pause_cafe_mat','pause_cafe_aprem','cocktail') NOT NULL,
  nom_menu VARCHAR(255) NOT NULL,
  description TEXT,
  prix_par_personne DECIMAL(10,2) DEFAULT 0,
  fournisseur VARCHAR(255),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS restauration_affectations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_id INT NOT NULL,
  personne_id INT NOT NULL,
  menu_id INT,
  type_salle ENUM('vip','normale') DEFAULT 'normale',
  nb_personnes INT DEFAULT 1,
  date_repas DATE,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (personne_id) REFERENCES personnes(id) ON DELETE CASCADE,
  FOREIGN KEY (menu_id) REFERENCES restauration_menus(id) ON DELETE SET NULL
);

-- 12. CONVENTIONS (hotel, photographe...)
CREATE TABLE IF NOT EXISTS conventions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_id INT NOT NULL,
  type ENUM('hotel','photographe','traiteur','impression','transport','securite','sonorisation','decoration','autre') NOT NULL,
  type_custom VARCHAR(150),
  fournisseur VARCHAR(255) NOT NULL,
  titre VARCHAR(255),
  montant DECIMAL(12,2) DEFAULT 0,
  montant_paye DECIMAL(12,2) DEFAULT 0,
  date_debut DATE,
  date_fin DATE,
  statut ENUM('brouillon','signee','en_cours','terminee','annulee') DEFAULT 'brouillon',
  description TEXT,
  document_paths JSON,
  contact TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

-- 13. BILLETS AVION
CREATE TABLE IF NOT EXISTS billets_avion (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_id INT NOT NULL,
  personne_id INT NOT NULL,
  compagnie VARCHAR(150),
  num_vol_aller VARCHAR(100),
  num_vol_retour VARCHAR(100),
  aeroport_depart VARCHAR(100),
  aeroport_arrivee VARCHAR(100),
  date_depart DATETIME,
  date_retour DATETIME,
  classe ENUM('economy','business','first') DEFAULT 'economy',
  prix DECIMAL(12,2) DEFAULT 0,
  statut ENUM('reserve','confirme','annule','en_attente') DEFAULT 'en_attente',
  billet_file_path VARCHAR(500),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (personne_id) REFERENCES personnes(id) ON DELETE CASCADE
);

-- 14. RESERVATIONS HOTEL
CREATE TABLE IF NOT EXISTS reservations_hotel (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_id INT NOT NULL,
  hotel_id INT NOT NULL,
  type_chambre ENUM('single','double','triple','suite','appartement') NOT NULL,
  numero_chambre VARCHAR(20),
  capacite_max INT DEFAULT 1,
  prix_nuit DECIMAL(10,2) DEFAULT 0,
  nb_nuits INT DEFAULT 1,
  prix_total DECIMAL(12,2) GENERATED ALWAYS AS (prix_nuit * nb_nuits) STORED,
  date_arrivee DATE,
  date_depart DATE,
  statut ENUM('reservee','confirmee','occupee','liberee','annulee') DEFAULT 'reservee',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reservation_occupants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reservation_id INT NOT NULL,
  personne_id INT NOT NULL,
  date_checkin DATE,
  date_checkout DATE,
  est_principal BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (reservation_id) REFERENCES reservations_hotel(id) ON DELETE CASCADE,
  FOREIGN KEY (personne_id) REFERENCES personnes(id) ON DELETE CASCADE,
  UNIQUE(reservation_id, personne_id)
);

-- Alertes hotel (vue logique applicative)
CREATE TABLE IF NOT EXISTS hotel_alerts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_id INT NOT NULL,
  reservation_id INT NOT NULL,
  type_alerte VARCHAR(100) DEFAULT 'chambre_sous_occupee',
  message TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (reservation_id) REFERENCES reservations_hotel(id) ON DELETE CASCADE
);

-- 15. PROGRAMME / DEROULEMENT
CREATE TABLE IF NOT EXISTS programmes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_id INT NOT NULL,
  jour DATE NOT NULL,
  heure_debut TIME NOT NULL,
  heure_fin TIME NOT NULL,
  titre VARCHAR(255) NOT NULL,
  description TEXT,
  type ENUM('discours','presentation','pause','atelier','table_ronde','dejeuner','ceremonie','autre') DEFAULT 'presentation',
  intervenant_nom VARCHAR(150),
  intervenant_prenom VARCHAR(150),
  intervenant_poste VARCHAR(150),
  intervenant_is_vip BOOLEAN DEFAULT FALSE,
  intervenant_email VARCHAR(255),
  theme VARCHAR(255),
  salle VARCHAR(150),
  presentation_file VARCHAR(500),
  presentation_type ENUM('pdf','ppt','pptx','doc','docx','autre'),
  ordre INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

-- 16. AUDIT JOURNAL
CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  action VARCHAR(100) NOT NULL,
  table_name VARCHAR(100),
  record_id INT,
  old_values JSON,
  new_values JSON,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 17. NOTIFICATIONS GLOBALES
CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_id INT,
  type VARCHAR(100),
  titre VARCHAR(255),
  message TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

-- INDEXES pour perf
CREATE INDEX idx_events_wilaya ON events(wilaya_id);
CREATE INDEX idx_personnes_event ON personnes(event_id);
CREATE INDEX idx_exposants_event ON exposants(event_id);
CREATE INDEX idx_stands_event ON stands(event_id);
CREATE INDEX idx_hotel_wilaya ON hotels(wilaya_id);
