-- ============================================================================
-- CAMPUS LOST AND FOUND DATABASE MANAGEMENT SYSTEM
-- Compatible with: Aiven MySQL (Cloud) & MySQL Workbench 8.0+
-- Schema: lostandfound_db / defaultdb
-- Normalized Relational Architecture
-- ============================================================================

CREATE DATABASE IF NOT EXISTS lostandfound_db
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE lostandfound_db;

-- ----------------------------------------------------------------------------
-- 1. Table: department
-- Department entity (department_id, department_name (CK))
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS department (
    department_id VARCHAR(64) NOT NULL,
    department_name VARCHAR(150) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (department_id),
    UNIQUE KEY uq_department_name (department_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 2. Table: category
-- Category entity (category_id, category_name (CK))
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS category (
    category_id VARCHAR(64) NOT NULL,
    category_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (category_id),
    UNIQUE KEY uq_category_name (category_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 3. Table: location
-- Campus location entity (location_id, location_name (CK))
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS location (
    location_id VARCHAR(64) NOT NULL,
    location_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (location_id),
    UNIQUE KEY uq_location_name (location_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 4. Table: student
-- Student entity (student_id, roll_no (CK), name, email (CK), password_hash, phone, department_id (FK))
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student (
    student_id VARCHAR(64) NOT NULL,
    roll_no VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    phone VARCHAR(32) DEFAULT NULL,
    department_id VARCHAR(64) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (student_id),
    UNIQUE KEY uq_student_roll_no (roll_no),
    UNIQUE KEY uq_student_email (email),
    INDEX idx_student_department (department_id),
    CONSTRAINT fk_student_department FOREIGN KEY (department_id)
        REFERENCES department (department_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 5. Table: admin
-- Admin entity (admin_id, staff_code (CK), name, email (CK), password_hash, office_location, phone)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin (
    admin_id VARCHAR(64) NOT NULL,
    staff_code VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    office_location VARCHAR(255) DEFAULT NULL,
    phone VARCHAR(32) DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (admin_id),
    UNIQUE KEY uq_admin_staff_code (staff_code),
    UNIQUE KEY uq_admin_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 6. Table: item
-- Item entity (item_id, title, item_type, description, event_date, image_url, status, created_at, category_id (FK), location_id (FK), reported_by (FK), reviewed_by (FK, nullable))
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS item (
    item_id VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    item_type ENUM('lost', 'found') NOT NULL,
    description TEXT NOT NULL,
    event_date VARCHAR(32) NOT NULL,
    image_url VARCHAR(2048) DEFAULT NULL,
    status ENUM('pending', 'approved', 'rejected', 'claimed', 'resolved') NOT NULL DEFAULT 'pending',
    category_id VARCHAR(64) NOT NULL,
    location_id VARCHAR(64) NOT NULL,
    reported_by VARCHAR(64) NOT NULL,
    reviewed_by VARCHAR(64) DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (item_id),
    INDEX idx_item_type (item_type),
    INDEX idx_item_status (status),
    INDEX idx_item_category (category_id),
    INDEX idx_item_location (location_id),
    INDEX idx_item_reported_by (reported_by),
    INDEX idx_item_reviewed_by (reviewed_by),
    CONSTRAINT fk_item_category FOREIGN KEY (category_id)
        REFERENCES category (category_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT fk_item_location FOREIGN KEY (location_id)
        REFERENCES location (location_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT fk_item_student FOREIGN KEY (reported_by)
        REFERENCES student (student_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT fk_item_admin FOREIGN KEY (reviewed_by)
        REFERENCES admin (admin_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 7. Table: claim
-- Claim entity (claim_id, proof_description, contact_phone, status, created_at, item_id (FK), student_id (FK), reviewed_by (FK, nullable))
-- Composite candidate key: (item_id, student_id), enforced by UNIQUE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS claim (
    claim_id VARCHAR(64) NOT NULL,
    proof_description TEXT NOT NULL,
    contact_phone VARCHAR(32) NOT NULL,
    status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    item_id VARCHAR(64) NOT NULL,
    student_id VARCHAR(64) NOT NULL,
    reviewed_by VARCHAR(64) DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (claim_id),
    UNIQUE KEY uq_claim_item_student (item_id, student_id),
    INDEX idx_claim_status (status),
    INDEX idx_claim_item_id (item_id),
    INDEX idx_claim_student_id (student_id),
    INDEX idx_claim_reviewed_by (reviewed_by),
    CONSTRAINT fk_claim_item FOREIGN KEY (item_id)
        REFERENCES item (item_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT fk_claim_student FOREIGN KEY (student_id)
        REFERENCES student (student_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT fk_claim_admin FOREIGN KEY (reviewed_by)
        REFERENCES admin (admin_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 8. Table: item_status_log
-- Audit log of status transitions (log_id, old_status, new_status, changed_at, item_id (FK))
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS item_status_log (
    log_id VARCHAR(64) NOT NULL,
    old_status VARCHAR(32) DEFAULT NULL,
    new_status VARCHAR(32) NOT NULL,
    changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    item_id VARCHAR(64) NOT NULL,
    PRIMARY KEY (log_id),
    INDEX idx_status_log_item (item_id),
    INDEX idx_status_log_changed_at (changed_at),
    CONSTRAINT fk_status_log_item FOREIGN KEY (item_id)
        REFERENCES item (item_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- SEED DATA
-- ----------------------------------------------------------------------------

-- Seed Departments
INSERT INTO department (department_id, department_name)
VALUES
    ('dept_cs', 'Computer Science'),
    ('dept_ec', 'Electronics & Communication'),
    ('dept_me', 'Mechanical Engineering'),
    ('dept_bt', 'Biotechnology'),
    ('dept_ba', 'Business Administration')
ON DUPLICATE KEY UPDATE department_name=VALUES(department_name);

-- Seed Categories
INSERT INTO category (category_id, category_name)
VALUES
    ('cat_elec', 'Electronics'),
    ('cat_belong', 'Personal Belongings'),
    ('cat_study', 'Study Materials'),
    ('cat_access', 'Accessories'),
    ('cat_docs', 'Cards & Documents'),
    ('cat_other', 'Other')
ON DUPLICATE KEY UPDATE category_name=VALUES(category_name);

-- Seed Locations
INSERT INTO location (location_id, location_name)
VALUES
    ('loc_lib', 'Main Campus Library 2nd Floor'),
    ('loc_dining', 'Campus Dining Hall West Entrance'),
    ('loc_eng', 'Engineering Hall Room 302'),
    ('loc_sports', 'Athletics Complex Bleachers'),
    ('loc_center', 'Student Center Lounge 1st Floor'),
    ('loc_ntb', 'NTB Building Quad')
ON DUPLICATE KEY UPDATE location_name=VALUES(location_name);

-- Seed Admins
INSERT INTO admin (admin_id, staff_code, name, email, password_hash, office_location, phone)
VALUES
    ('adm_001', 'STAFF-SEC-01', 'Hariom Singh', 'hariom18august@gmail.com', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'Student Activity Center Rm 104', '555-0199')
ON DUPLICATE KEY UPDATE name=VALUES(name), office_location=VALUES(office_location);

-- Seed Students
INSERT INTO student (student_id, roll_no, name, email, password_hash, phone, department_id)
VALUES
    ('std_101', 'CS202401', 'Arth', 'arth@campus.edu', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', '555-0101', 'dept_cs'),
    ('std_102', 'EC202415', 'Shivam', 'shivam@campus.edu', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', '555-0102', 'dept_ec'),
    ('std_103', 'ME202432', 'Marcus Johnson', 'marcus.j@campus.edu', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', '555-0103', 'dept_me')
ON DUPLICATE KEY UPDATE name=VALUES(name), department_id=VALUES(department_id);

-- Seed Items
INSERT INTO item (item_id, title, item_type, description, event_date, image_url, status, category_id, location_id, reported_by, reviewed_by)
VALUES
    ('item_1', 'MacBook Air M2 Silver', 'lost', 'Silver MacBook Air in a dark grey protective felt sleeve with campus computer club stickers on lid.', '2026-10-06', 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=600&q=80', 'approved', 'cat_elec', 'loc_lib', 'std_101', 'adm_001'),
    ('item_2', 'Brown Leather Bi-fold Wallet', 'found', 'Brown leather wallet containing student transit pass and library card. Turned into dining hall counter.', '2026-10-07', 'https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&w=600&q=80', 'approved', 'cat_belong', 'loc_dining', 'std_102', 'adm_001'),
    ('item_3', 'TI-84 Plus CE Graphing Calculator', 'lost', 'Black TI-84 Plus CE graphing calculator with cobalt blue sliding cover. Initials MJ on battery compartment.', '2026-10-08', 'https://images.unsplash.com/photo-1594980596870-8aa52a78d8cd?auto=format&fit=crop&w=600&q=80', 'approved', 'cat_study', 'loc_eng', 'std_103', 'adm_001'),
    ('item_4', 'Hydro Flask Water Bottle 32oz', 'found', 'Cobalt blue stainless steel bottle with yellow hiking club sticker on side. Found left on bleachers.', '2026-10-08', 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=600&q=80', 'claimed', 'cat_access', 'loc_sports', 'std_101', 'adm_001'),
    ('item_5', 'Dell XPS 15 Silver Laptop', 'lost', 'Silver Dell laptop with student department sticker on base reported lost near Library.', '2026-10-10', 'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?auto=format&fit=crop&w=600&q=80', 'pending', 'cat_elec', 'loc_lib', 'std_101', NULL)
ON DUPLICATE KEY UPDATE title=VALUES(title), status=VALUES(status);

-- Seed Claims
INSERT INTO claim (claim_id, proof_description, contact_phone, status, item_id, student_id, reviewed_by)
VALUES
    ('claim_1', 'Wallet has my student transit ID ending in 2432 and driver license.', '555-0103', 'pending', 'item_2', 'std_103', NULL)
ON DUPLICATE KEY UPDATE status=VALUES(status);

-- Seed Initial Status Logs
INSERT INTO item_status_log (log_id, old_status, new_status, item_id)
VALUES
    ('log_item_1_init', NULL, 'approved', 'item_1'),
    ('log_item_2_init', NULL, 'approved', 'item_2'),
    ('log_item_3_init', NULL, 'approved', 'item_3'),
    ('log_item_4_init', 'approved', 'claimed', 'item_4'),
    ('log_item_5_init', NULL, 'pending', 'item_5')
ON DUPLICATE KEY UPDATE new_status=VALUES(new_status);
