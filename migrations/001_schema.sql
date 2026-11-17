-- ============================================================
-- AgroPoint POS — Database Schema (Node backend)
-- Extends the original PHP schema:
--   * employees.password  ->  password_hash (bcrypt)
--   * sales gains the fields the frontend actually sends
--     (cashier, payment_type, settled_immediately, customer_phone, reference)
--
-- The migrate runner (migrations/run.ts) applies this file and then
-- reconciles columns on any pre-existing tables, so this is safe to run
-- against both a fresh DB and the existing PHP database.
-- ============================================================

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pos_id VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  barcode VARCHAR(64) NULL,
  category VARCHAR(128) NULL,
  purchase DECIMAL(12,2) NOT NULL DEFAULT 0,
  price DECIMAL(12,2) NOT NULL DEFAULT 0,
  stock INT NOT NULL DEFAULT 0,
  unit VARCHAR(32) NOT NULL DEFAULT 'bottle',
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  INDEX (barcode)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS employees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pos_id VARCHAR(32) NOT NULL UNIQUE,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(128) NOT NULL,
  role ENUM('admin','employee') NOT NULL DEFAULT 'employee',
  created_at DATETIME NULL,
  updated_at DATETIME NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pos_id VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  phone VARCHAR(32) NULL,
  balance DECIMAL(14,2) NOT NULL DEFAULT 0,
  created_at DATETIME NULL,
  updated_at DATETIME NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sales (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pos_id VARCHAR(32) NOT NULL UNIQUE,
  cashier VARCHAR(128) NULL,
  customer_id VARCHAR(32) NULL,
  customer_name VARCHAR(128) NULL,
  customer_phone VARCHAR(32) NULL,
  reference VARCHAR(255) NULL,
  subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
  discount DECIMAL(14,2) NOT NULL DEFAULT 0,
  total DECIMAL(14,2) NOT NULL DEFAULT 0,
  payment_type VARCHAR(32) NOT NULL DEFAULT 'cash',
  settled_immediately TINYINT(1) NOT NULL DEFAULT 0,
  return_of VARCHAR(32) NULL, -- if set, this row is a RETURN of the referenced sale (negative amounts/qty)
  sale_date DATETIME NULL,
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  INDEX (customer_id),
  INDEX (sale_date),
  INDEX (return_of)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sale_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sale_id INT NOT NULL,
  product_id VARCHAR(32) NULL,
  name VARCHAR(128) NOT NULL,
  price DECIMAL(12,2) NOT NULL DEFAULT 0,
  cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  qty INT NOT NULL DEFAULT 1,
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ledger_tx (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pos_id VARCHAR(32) NOT NULL UNIQUE,
  customer_id VARCHAR(32) NOT NULL,
  type ENUM('udhaar','wasooli') NOT NULL,
  amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  note VARCHAR(255) NULL,
  ref VARCHAR(128) NULL,
  sale_ids JSON NULL,
  tx_date DATETIME NULL,
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  INDEX (customer_id),
  INDEX (tx_date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS purchases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pos_id VARCHAR(32) NOT NULL UNIQUE,
  product_id VARCHAR(32) NULL,
  product_name VARCHAR(128) NOT NULL,
  qty INT NOT NULL DEFAULT 0,
  cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(14,2) NOT NULL DEFAULT 0,
  note VARCHAR(255) NULL,
  purchase_date DATETIME NULL,
  created_at DATETIME NULL,
  updated_at DATETIME NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS settings (
  `key` VARCHAR(64) PRIMARY KEY,
  `value` TEXT NULL,
  created_at DATETIME NULL,
  updated_at DATETIME NULL
) ENGINE=InnoDB;

-- ============================================================
-- Seed data — non-sensitive defaults. Default employees are seeded
-- with bcrypt-hashed passwords by the migrate runner (run.ts), not here.
-- ============================================================

INSERT INTO settings (`key`, `value`) VALUES
  ('shopName', 'Ahmad Zari Corporation'),
  ('address',  'Main Bazaar, Lahore'),
  ('phone',    '0300-0000000'),
  ('footer',   'Thank you for shopping with us!')
ON DUPLICATE KEY UPDATE `key` = `key`;

INSERT INTO products (pos_id, name, barcode, category, purchase, price, stock, unit) VALUES
  ('seed_p_001', 'Confidor 200SL (100ml)', '8901', 'Insecticide', 350, 450, 40, 'bottle'),
  ('seed_p_002', 'Roundup Weedicide (1L)', '8902', 'Weedicide',  900, 1150, 15, 'bottle'),
  ('seed_p_003', 'Score Fungicide (250ml)', '8903', 'Fungicide',  600, 780,  3, 'bottle')
ON DUPLICATE KEY UPDATE pos_id = pos_id;
