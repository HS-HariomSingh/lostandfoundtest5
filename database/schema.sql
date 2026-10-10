CREATE DATABASE IF NOT EXISTS lostandfound_db
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE lostandfound_db;

CREATE TABLE IF NOT EXISTS students (
    id VARCHAR(64) NOT NULL,
    student_id VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    department VARCHAR(255) NOT NULL,
    phone VARCHAR(32) DEFAULT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'student',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_students_student_id (student_id),
    UNIQUE KEY uq_students_email (email),
    INDEX idx_students_department (department)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admins (
    id VARCHAR(64) NOT NULL,
    admin_id VARCHAR(64) DEFAULT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    office_location VARCHAR(255) DEFAULT NULL,
    phone VARCHAR(32) DEFAULT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'admin',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_admins_email (email),
    UNIQUE KEY uq_admins_admin_id (admin_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS items (
    id VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    type ENUM('lost', 'found') NOT NULL,
    category VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    location VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    image_url VARCHAR(1024) DEFAULT NULL,
    status ENUM('pending', 'approved', 'rejected', 'claimed', 'resolved') NOT NULL DEFAULT 'pending',
    student_id VARCHAR(64) DEFAULT NULL,
    student_name VARCHAR(255) DEFAULT NULL,
    student_email VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_items_type (type),
    INDEX idx_items_category (category),
    INDEX idx_items_status (status),
    INDEX idx_items_date (date),
    INDEX idx_items_student_id (student_id),
    INDEX idx_items_type_status (type, status),
    CONSTRAINT fk_items_student FOREIGN KEY (student_id)
        REFERENCES students (id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS item_claims (
    id VARCHAR(64) NOT NULL,
    item_id VARCHAR(64) NOT NULL,
    item_title VARCHAR(255) DEFAULT NULL,
    student_id VARCHAR(64) NOT NULL,
    student_name VARCHAR(255) DEFAULT NULL,
    student_email VARCHAR(255) DEFAULT NULL,
    proof_description TEXT NOT NULL,
    contact_phone VARCHAR(32) NOT NULL,
    status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_claims_item_id (item_id),
    INDEX idx_claims_student_id (student_id),
    INDEX idx_claims_status (status),
    INDEX idx_claims_created_at (created_at),
    CONSTRAINT fk_claims_item FOREIGN KEY (item_id)
        REFERENCES items (id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT fk_claims_student FOREIGN KEY (student_id)
        REFERENCES students (id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
