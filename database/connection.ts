import mysql, { Pool } from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config({ override: true });

export interface AivenConfig {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  uri?: string;
  sslMode?: string;
  rejectUnauthorized?: boolean;
}

const LOCAL_DATA_PATH = path.resolve(process.cwd(), 'database', 'local_db.json');

export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export function resolveAivenConfig(): AivenConfig {
  dotenv.config({ override: true });

  const uri = process.env.AIVEN_MYSQL_URL || 
              process.env.AIVEN_SERVICE_URI || 
              process.env.DATABASE_URL;

  let uriHost: string | undefined;
  let uriPort: number | undefined;
  let uriUser: string | undefined;
  let uriPassword: string | undefined;
  let uriDatabase: string | undefined;

  if (uri) {
    try {
      const parsed = new URL(uri);
      uriHost = parsed.hostname;
      uriPort = parsed.port ? parseInt(parsed.port, 10) : undefined;
      uriUser = parsed.username ? decodeURIComponent(parsed.username) : undefined;
      uriPassword = parsed.password ? decodeURIComponent(parsed.password) : undefined;
      uriDatabase = parsed.pathname ? parsed.pathname.replace(/^\//, '') : undefined;
    } catch {
      // ignore uri parse errors
    }
  }

  const host = uriHost || process.env.AIVEN_MYSQL_HOST || 'mysql-3b22f65e-hariom18august-b043.h.aivencloud.com';
  const port = uriPort || parseInt(process.env.AIVEN_MYSQL_PORT || '14526', 10);
  const user = uriUser || process.env.AIVEN_MYSQL_USER || 'avnadmin';
  const password = uriPassword || process.env.AIVEN_MYSQL_PASSWORD || '';
  const database = uriDatabase || process.env.AIVEN_MYSQL_DATABASE || 'defaultdb';
  const rejectUnauthorized = process.env.AIVEN_MYSQL_REJECT_UNAUTHORIZED !== 'false';

  return {
    uri,
    host,
    port,
    user,
    password,
    database,
    rejectUnauthorized,
  };
}

let poolInstance: Pool | null = null;
let aivenAvailable = false;
let lastAivenError: string | null = null;
let lastCheckedAt = 0;

export function getAivenPool(): Pool {
  if (poolInstance) {
    return poolInstance;
  }

  const config = resolveAivenConfig();

  poolInstance = mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    ssl: {
      rejectUnauthorized: false
    },
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    connectTimeout: 4000,
  });

  return poolInstance;
}

export function isAivenLive(): boolean {
  return aivenAvailable;
}

export function getAivenDiagnostics() {
  const config = resolveAivenConfig();
  return {
    connected: aivenAvailable,
    host: config.host,
    port: config.port,
    user: config.user,
    database: config.database,
    ssl: "REQUIRED",
    lastChecked: lastCheckedAt ? new Date(lastCheckedAt).toISOString() : null,
    lastError: lastAivenError,
    mode: aivenAvailable ? "Aiven Cloud MySQL" : "Local Storage Fallback (Aiven Offline/Paused in Console)"
  };
}

function getLocalDb(): {
  department: Record<string, any>;
  category: Record<string, any>;
  location: Record<string, any>;
  student: Record<string, any>;
  admin: Record<string, any>;
  item: Record<string, any>;
  claim: Record<string, any>;
  item_status_log: Record<string, any>;
} {
  if (fs.existsSync(LOCAL_DATA_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(LOCAL_DATA_PATH, 'utf-8'));
    } catch {}
  }
  return {
    department: {},
    category: {},
    location: {},
    student: {},
    admin: {},
    item: {},
    claim: {},
    item_status_log: {}
  };
}

function saveLocalDb(data: any) {
  try {
    fs.mkdirSync(path.dirname(LOCAL_DATA_PATH), { recursive: true });
    fs.writeFileSync(LOCAL_DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch {}
}

export async function syncLocalToAiven(): Promise<void> {
  if (!aivenAvailable) return;
  try {
    const local = getLocalDb();
    const pool = getAivenPool();

    // 1. Sync Departments
    for (const [id, d] of Object.entries(local.department || {})) {
      await pool.query(
        'INSERT INTO department (department_id, department_name) VALUES (?, ?) ON DUPLICATE KEY UPDATE department_name=VALUES(department_name)',
        [d.department_id || id, d.department_name]
      );
    }

    // 2. Sync Categories
    for (const [id, c] of Object.entries(local.category || {})) {
      await pool.query(
        'INSERT INTO category (category_id, category_name) VALUES (?, ?) ON DUPLICATE KEY UPDATE category_name=VALUES(category_name)',
        [c.category_id || id, c.category_name]
      );
    }

    // 3. Sync Locations
    for (const [id, l] of Object.entries(local.location || {})) {
      await pool.query(
        'INSERT INTO location (location_id, location_name) VALUES (?, ?) ON DUPLICATE KEY UPDATE location_name=VALUES(location_name)',
        [l.location_id || id, l.location_name]
      );
    }

    // 4. Sync Students
    for (const [id, s] of Object.entries(local.student || {})) {
      await pool.query(`
        INSERT INTO student (student_id, roll_no, name, email, password_hash, phone, department_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE name=VALUES(name), phone=VALUES(phone)
      `, [
        s.student_id || id,
        s.roll_no || s.student_id || id,
        s.name,
        s.email,
        s.password_hash,
        s.phone,
        s.department_id || 'dept_cs'
      ]);
    }

    // 5. Sync Admins
    for (const [id, a] of Object.entries(local.admin || {})) {
      await pool.query(`
        INSERT INTO admin (admin_id, staff_code, name, email, password_hash, office_location, phone)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE name=VALUES(name), office_location=VALUES(office_location)
      `, [
        a.admin_id || id,
        a.staff_code || 'STAFF-01',
        a.name,
        a.email,
        a.password_hash,
        a.office_location,
        a.phone
      ]);
    }

    // 6. Sync Items
    for (const [id, it] of Object.entries(local.item || {})) {
      await pool.query(`
        INSERT INTO item (item_id, title, item_type, description, event_date, image_url, status, category_id, location_id, reported_by, reviewed_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE status=VALUES(status), title=VALUES(title)
      `, [
        it.item_id || id,
        it.title,
        it.item_type || it.type || 'lost',
        it.description || '',
        it.event_date || it.date || new Date().toISOString().slice(0, 10),
        it.image_url || null,
        it.status || 'pending',
        it.category_id || 'cat_elec',
        it.location_id || 'loc_lib',
        it.reported_by || it.student_id || 'std_101',
        it.reviewed_by || null
      ]);
    }

    // 7. Sync Claims
    for (const [id, cl] of Object.entries(local.claim || {})) {
      await pool.query(`
        INSERT INTO claim (claim_id, proof_description, contact_phone, status, item_id, student_id, reviewed_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE status=VALUES(status), reviewed_by=VALUES(reviewed_by)
      `, [
        cl.claim_id || id,
        cl.proof_description,
        cl.contact_phone,
        cl.status || 'pending',
        cl.item_id,
        cl.student_id,
        cl.reviewed_by || null
      ]);
    }

    // 8. Sync Status Logs
    for (const [id, log] of Object.entries(local.item_status_log || {})) {
      await pool.query(`
        INSERT IGNORE INTO item_status_log (log_id, old_status, new_status, item_id, changed_at)
        VALUES (?, ?, ?, ?, ?)
      `, [
        log.log_id || id,
        log.old_status || null,
        log.new_status || 'pending',
        log.item_id,
        log.changed_at ? new Date(log.changed_at) : new Date()
      ]);
    }

    console.log('[DB] 🔄 Synchronized local offline records to Aiven MySQL Cloud.');
  } catch (err: any) {
    console.error('[DB] Sync warning:', err.message);
  }
}

export async function testAivenConnection(forceNew: boolean = false): Promise<{
  success: boolean;
  message: string;
  version?: string;
  database?: string;
  host?: string;
  port?: number;
}> {
  const config = resolveAivenConfig();
  if (forceNew || !aivenAvailable) {
    if (poolInstance) {
      try {
        await poolInstance.end();
      } catch {}
      poolInstance = null;
    }
  }

  try {
    const pool = getAivenPool();
    const [rows] = await pool.query<any[]>('SELECT VERSION() AS version, DATABASE() AS db_name, NOW() AS server_time');
    const row = rows[0] || {};
    const wasOffline = !aivenAvailable;
    aivenAvailable = true;
    lastAivenError = null;
    lastCheckedAt = Date.now();

    if (wasOffline) {
      syncLocalToAiven().catch(() => {});
    }

    return {
      success: true,
      message: 'Connected to Aiven MySQL successfully!',
      version: row.version,
      database: row.db_name,
      host: config.host,
      port: config.port
    };
  } catch (error: any) {
    aivenAvailable = false;
    lastAivenError = error.message || String(error);
    lastCheckedAt = Date.now();
    return {
      success: false,
      message: `Aiven MySQL unreachable: ${lastAivenError}`,
      host: config.host,
      port: config.port
    };
  }
}

export async function updateAivenConfig(newConfig: {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  uri?: string;
}): Promise<{ success: boolean; message: string; diagnostics: any }> {
  if (newConfig.host) process.env.AIVEN_MYSQL_HOST = newConfig.host;
  if (newConfig.port) process.env.AIVEN_MYSQL_PORT = String(newConfig.port);
  if (newConfig.user) process.env.AIVEN_MYSQL_USER = newConfig.user;
  if (newConfig.password) process.env.AIVEN_MYSQL_PASSWORD = newConfig.password;
  if (newConfig.database) process.env.AIVEN_MYSQL_DATABASE = newConfig.database;
  if (newConfig.uri) process.env.AIVEN_MYSQL_URL = newConfig.uri;

  try {
    const envPath = path.resolve(process.cwd(), '.env');
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf-8');
    }
    const lines = envContent.split('\n').filter(l => !l.startsWith('AIVEN_MYSQL_'));
    const host = process.env.AIVEN_MYSQL_HOST;
    const port = process.env.AIVEN_MYSQL_PORT;
    const user = process.env.AIVEN_MYSQL_USER;
    const pass = process.env.AIVEN_MYSQL_PASSWORD;
    const db = process.env.AIVEN_MYSQL_DATABASE;
    lines.push(`AIVEN_MYSQL_HOST="${host}"`);
    lines.push(`AIVEN_MYSQL_PORT="${port}"`);
    lines.push(`AIVEN_MYSQL_USER="${user}"`);
    lines.push(`AIVEN_MYSQL_PASSWORD="${pass}"`);
    lines.push(`AIVEN_MYSQL_DATABASE="${db}"`);
    lines.push(`AIVEN_MYSQL_URL="mysql://${user}:${pass}@${host}:${port}/${db}?ssl-mode=REQUIRED"`);
    fs.writeFileSync(envPath, lines.join('\n'), 'utf-8');
  } catch {}

  try {
    const cfgPath = path.resolve(process.cwd(), 'database', 'aiven_config.json');
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      cfg.connection = {
        host: process.env.AIVEN_MYSQL_HOST,
        port: parseInt(process.env.AIVEN_MYSQL_PORT || '14526', 10),
        user: process.env.AIVEN_MYSQL_USER,
        database: process.env.AIVEN_MYSQL_DATABASE,
        ssl_mode: 'REQUIRED'
      };
      fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf-8');
    }
  } catch {}

  if (poolInstance) {
    try {
      await poolInstance.end();
    } catch {}
    poolInstance = null;
  }

  const test = await testAivenConnection(true);
  if (test.success) {
    await initAivenDatabase();
  }

  return {
    success: test.success,
    message: test.message,
    diagnostics: getAivenDiagnostics()
  };
}

export async function initAivenDatabase(): Promise<void> {
  console.log('[DB] Checking Aiven MySQL Cloud connection...');
  const res = await testAivenConnection();
  if (res.success) {
    console.log(`[DB] ✅ Connected to Aiven MySQL (${res.database} on ${res.host}:${res.port})`);
    try {
      const pool = getAivenPool();

      // 1. Table: department
      await pool.query(`
        CREATE TABLE IF NOT EXISTS department (
          department_id VARCHAR(64) NOT NULL PRIMARY KEY,
          department_name VARCHAR(150) NOT NULL UNIQUE,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // 2. Table: category
      await pool.query(`
        CREATE TABLE IF NOT EXISTS category (
          category_id VARCHAR(64) NOT NULL PRIMARY KEY,
          category_name VARCHAR(100) NOT NULL UNIQUE,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // 3. Table: location
      await pool.query(`
        CREATE TABLE IF NOT EXISTS location (
          location_id VARCHAR(64) NOT NULL PRIMARY KEY,
          location_name VARCHAR(255) NOT NULL UNIQUE,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // 4. Table: student
      await pool.query(`
        CREATE TABLE IF NOT EXISTS student (
          student_id VARCHAR(64) NOT NULL PRIMARY KEY,
          roll_no VARCHAR(64) NOT NULL UNIQUE,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) NOT NULL UNIQUE,
          password_hash VARCHAR(255) NOT NULL,
          phone VARCHAR(32) DEFAULT NULL,
          department_id VARCHAR(64) NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_student_department FOREIGN KEY (department_id)
            REFERENCES department (department_id)
            ON UPDATE CASCADE
            ON DELETE RESTRICT
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // 5. Table: admin
      await pool.query(`
        CREATE TABLE IF NOT EXISTS admin (
          admin_id VARCHAR(64) NOT NULL PRIMARY KEY,
          staff_code VARCHAR(64) NOT NULL UNIQUE,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) NOT NULL UNIQUE,
          password_hash VARCHAR(255) NOT NULL,
          office_location VARCHAR(255) DEFAULT NULL,
          phone VARCHAR(32) DEFAULT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // 6. Table: item
      await pool.query(`
        CREATE TABLE IF NOT EXISTS item (
          item_id VARCHAR(64) NOT NULL PRIMARY KEY,
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
          CONSTRAINT fk_item_category FOREIGN KEY (category_id)
            REFERENCES category (category_id) ON UPDATE CASCADE,
          CONSTRAINT fk_item_location FOREIGN KEY (location_id)
            REFERENCES location (location_id) ON UPDATE CASCADE,
          CONSTRAINT fk_item_student FOREIGN KEY (reported_by)
            REFERENCES student (student_id) ON UPDATE CASCADE ON DELETE CASCADE,
          CONSTRAINT fk_item_admin FOREIGN KEY (reviewed_by)
            REFERENCES admin (admin_id) ON UPDATE CASCADE ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // 7. Table: claim
      await pool.query(`
        CREATE TABLE IF NOT EXISTS claim (
          claim_id VARCHAR(64) NOT NULL PRIMARY KEY,
          proof_description TEXT NOT NULL,
          contact_phone VARCHAR(32) NOT NULL,
          status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
          item_id VARCHAR(64) NOT NULL,
          student_id VARCHAR(64) NOT NULL,
          reviewed_by VARCHAR(64) DEFAULT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_claim_item_student (item_id, student_id),
          CONSTRAINT fk_claim_item FOREIGN KEY (item_id)
            REFERENCES item (item_id) ON UPDATE CASCADE ON DELETE CASCADE,
          CONSTRAINT fk_claim_student FOREIGN KEY (student_id)
            REFERENCES student (student_id) ON UPDATE CASCADE ON DELETE CASCADE,
          CONSTRAINT fk_claim_admin FOREIGN KEY (reviewed_by)
            REFERENCES admin (admin_id) ON UPDATE CASCADE ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // 8. Table: item_status_log
      await pool.query(`
        CREATE TABLE IF NOT EXISTS item_status_log (
          log_id VARCHAR(64) NOT NULL PRIMARY KEY,
          old_status VARCHAR(32) DEFAULT NULL,
          new_status VARCHAR(32) NOT NULL,
          changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          item_id VARCHAR(64) NOT NULL,
          CONSTRAINT fk_status_log_item FOREIGN KEY (item_id)
            REFERENCES item (item_id) ON UPDATE CASCADE ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // Seed initial data
      await pool.query(`
        INSERT INTO department (department_id, department_name)
        VALUES
          ('dept_cs', 'Computer Science'),
          ('dept_ec', 'Electronics & Communication'),
          ('dept_me', 'Mechanical Engineering')
        ON DUPLICATE KEY UPDATE department_name=VALUES(department_name);
      `);

      await pool.query(`
        INSERT INTO category (category_id, category_name)
        VALUES
          ('cat_elec', 'Electronics'),
          ('cat_belong', 'Personal Belongings'),
          ('cat_study', 'Study Materials'),
          ('cat_access', 'Accessories')
        ON DUPLICATE KEY UPDATE category_name=VALUES(category_name);
      `);

      await pool.query(`
        INSERT INTO location (location_id, location_name)
        VALUES
          ('loc_lib', 'Main Campus Library 2nd Floor'),
          ('loc_dining', 'Campus Dining Hall West Entrance'),
          ('loc_eng', 'Engineering Hall Room 302'),
          ('loc_sports', 'Athletics Complex Bleachers')
        ON DUPLICATE KEY UPDATE location_name=VALUES(location_name);
      `);

      await pool.query(`
        INSERT INTO admin (admin_id, staff_code, name, email, password_hash, office_location, phone)
        VALUES ('adm_001', 'STAFF-SEC-01', 'Hariom Singh', 'hariom18august@gmail.com', '${hashPassword("admin123")}', 'Student Activity Center Rm 104', '555-0199')
        ON DUPLICATE KEY UPDATE name=VALUES(name);
      `);

      await pool.query(`
        INSERT INTO student (student_id, roll_no, name, email, password_hash, phone, department_id)
        VALUES 
          ('std_101', 'CS202401', 'Arth', 'arth@campus.edu', '${hashPassword("password123")}', '555-0101', 'dept_cs'),
          ('std_102', 'EC202415', 'Shivam', 'shivam@campus.edu', '${hashPassword("password123")}', '555-0102', 'dept_ec')
        ON DUPLICATE KEY UPDATE name=VALUES(name);
      `);

      console.log('[DB] ✅ Aiven MySQL 8-table normalized schema & seed verified.');
    } catch (err: any) {
      console.error('[DB] Schema setup warning:', err.message);
    }
  } else {
    console.warn(`[DB] ⚠️ Aiven MySQL is currently offline/paused: ${res.message}`);
    console.log('[DB] 👉 Seamless local database active. Once Aiven MySQL is resumed, it will connect automatically.');
  }

  // Set periodic active reconnect check every 5 seconds
  setInterval(async () => {
    if (!aivenAvailable) {
      const retry = await testAivenConnection(true);
      if (retry.success) {
        console.log('[DB] 🚀 Aiven MySQL is back online! Switched to live cloud database.');
        try {
          await initAivenDatabase();
          await syncLocalToAiven();
        } catch {}
      }
    }
  }, 5000);
}

// -------------------------------------------------------------
// Normalized Data Access Layer
// -------------------------------------------------------------

export async function getDepartments(): Promise<any[]> {
  if (aivenAvailable) {
    try {
      const pool = getAivenPool();
      const [rows] = await pool.query<any[]>('SELECT * FROM department ORDER BY department_name ASC');
      return rows;
    } catch (e) {
      aivenAvailable = false;
    }
  }
  const local = getLocalDb();
  return Object.values(local.department || {});
}

export async function getCategories(): Promise<any[]> {
  if (aivenAvailable) {
    try {
      const pool = getAivenPool();
      const [rows] = await pool.query<any[]>('SELECT * FROM category ORDER BY category_name ASC');
      return rows;
    } catch (e) {
      aivenAvailable = false;
    }
  }
  const local = getLocalDb();
  return Object.values(local.category || {});
}

export async function getLocations(): Promise<any[]> {
  if (aivenAvailable) {
    try {
      const pool = getAivenPool();
      const [rows] = await pool.query<any[]>('SELECT * FROM location ORDER BY location_name ASC');
      return rows;
    } catch (e) {
      aivenAvailable = false;
    }
  }
  const local = getLocalDb();
  return Object.values(local.location || {});
}

export async function findUser(email: string, targetRole: 'admin' | 'student'): Promise<any | null> {
  const emailClean = email.trim().toLowerCase();

  if (targetRole === 'admin') {
    if (aivenAvailable) {
      try {
        const pool = getAivenPool();
        const [rows] = await pool.query<any[]>('SELECT * FROM admin WHERE LOWER(email) = ? LIMIT 1', [emailClean]);
        if (rows && rows.length > 0) return { ...rows[0], id: rows[0].admin_id, role: 'admin' };
      } catch (e) {
        aivenAvailable = false;
      }
    }
    const local = getLocalDb();
    const adm = Object.values(local.admin || {}).find((a: any) => a.email && a.email.toLowerCase() === emailClean);
    return adm ? { ...adm, id: adm.admin_id, role: 'admin' } : null;
  } else {
    if (aivenAvailable) {
      try {
        const pool = getAivenPool();
        const [rows] = await pool.query<any[]>(`
          SELECT s.*, d.department_name
          FROM student s
          LEFT JOIN department d ON s.department_id = d.department_id
          WHERE LOWER(s.email) = ? LIMIT 1
        `, [emailClean]);
        if (rows && rows.length > 0) {
          const r = rows[0];
          return { ...r, id: r.student_id, student_id: r.roll_no, role: 'student', department: r.department_name };
        }
      } catch (e) {
        aivenAvailable = false;
      }
    }
    const local = getLocalDb();
    const std = Object.values(local.student || {}).find((s: any) => s.email && s.email.toLowerCase() === emailClean);
    if (std) {
      const deptName = local.department?.[std.department_id]?.department_name || std.department_name || 'Computer Science';
      return { ...std, id: std.student_id, student_id: std.roll_no || std.student_id, role: 'student', department: deptName };
    }
    return null;
  }
}

export async function getAllStudents(): Promise<any[]> {
  if (aivenAvailable) {
    try {
      const pool = getAivenPool();
      const [rows] = await pool.query<any[]>(`
        SELECT s.student_id AS id, s.roll_no AS student_id, s.name, s.email, s.phone,
               d.department_name AS department, 'student' AS role, s.created_at
        FROM student s
        LEFT JOIN department d ON s.department_id = d.department_id
        ORDER BY s.roll_no ASC
      `);
      return rows;
    } catch (e) {
      aivenAvailable = false;
    }
  }

  const local = getLocalDb();
  return (Object.values(local.student || {}) as any[]).map((s: any) => {
    const deptName = local.department?.[s.department_id]?.department_name || s.department_name || 'General';
    return {
      id: s.student_id,
      student_id: s.roll_no || s.student_id,
      name: s.name,
      email: s.email,
      phone: s.phone,
      department: deptName,
      role: 'student',
      created_at: s.created_at
    };
  }).sort((a: any, b: any) => (a.student_id || "").localeCompare(b.student_id || ""));
}

export async function getItems(filters: {
  type?: string;
  category?: string;
  status_filter?: string;
  search?: string;
}): Promise<any[]> {
  if (aivenAvailable) {
    try {
      const pool = getAivenPool();
      let sql = `
        SELECT i.item_id AS id, i.item_id AS item_id, i.title,
               i.item_type AS type, i.item_type AS item_type, i.description,
               i.event_date AS date, i.event_date AS event_date, i.image_url, i.status, i.created_at,
               COALESCE(c.category_name, 'General') AS category,
               COALESCE(c.category_name, 'General') AS category_name,
               i.category_id AS category_id,
               COALESCE(l.location_name, 'Campus') AS location,
               COALESCE(l.location_name, 'Campus') AS location_name,
               i.location_id AS location_id,
               s.student_id AS student_id, s.student_id AS reported_by,
               s.name AS student_name, s.email AS student_email,
               s.roll_no AS roll_no, s.roll_no AS student_roll_no,
               a.name AS reviewer_name
        FROM item i
        LEFT JOIN category c ON i.category_id = c.category_id
        LEFT JOIN location l ON i.location_id = l.location_id
        LEFT JOIN student s ON i.reported_by = s.student_id
        LEFT JOIN admin a ON i.reviewed_by = a.admin_id
        WHERE 1=1
      `;
      const params: any[] = [];

      if (filters.status_filter && filters.status_filter !== 'all') {
        sql += ' AND i.status = ?';
        params.push(filters.status_filter);
      }
      if (filters.type && filters.type !== 'all') {
        sql += ' AND i.item_type = ?';
        params.push(filters.type);
      }
      if (filters.category && filters.category !== 'all') {
        sql += ' AND (c.category_name = ? OR i.category_id = ?)';
        params.push(filters.category, filters.category);
      }
      if (filters.search) {
        sql += ' AND (LOWER(i.title) LIKE ? OR LOWER(i.description) LIKE ? OR LOWER(COALESCE(l.location_name, \'\')) LIKE ?)';
        const term = `%${filters.search.toLowerCase()}%`;
        params.push(term, term, term);
      }

      sql += ' ORDER BY i.created_at DESC';
      const [rows] = await pool.query<any[]>(sql, params);
      return rows;
    } catch (e) {
      aivenAvailable = false;
    }
  }

  const local = getLocalDb();
  let items = Object.entries(local.item || {}).map(([k, v]: [string, any]) => {
    const cat = local.category?.[v.category_id]?.category_name || v.category || v.category_name || 'General';
    const loc = local.location?.[v.location_id]?.location_name || v.location || v.location_name || 'Campus';
    const std = local.student?.[v.reported_by || v.student_id] || {};
    const itemId = v.item_id || v.id || k;
    const itemType = v.item_type || v.type || 'lost';
    const eventDate = v.event_date || v.date || new Date().toISOString().slice(0, 10);
    return {
      id: itemId,
      item_id: itemId,
      title: v.title || 'Untitled',
      type: itemType,
      item_type: itemType,
      category: cat,
      category_name: cat,
      category_id: v.category_id || 'cat_elec',
      location: loc,
      location_name: loc,
      location_id: v.location_id || 'loc_lib',
      description: v.description || '',
      date: eventDate,
      event_date: eventDate,
      image_url: v.image_url || null,
      status: v.status || 'pending',
      student_id: v.reported_by || v.student_id || 'std_101',
      reported_by: v.reported_by || v.student_id || 'std_101',
      student_name: std.name || v.student_name || 'Student',
      student_email: std.email || v.student_email || '',
      roll_no: std.roll_no || v.roll_no || v.student_roll_no || '',
      student_roll_no: std.roll_no || v.roll_no || v.student_roll_no || '',
      created_at: v.created_at || new Date().toISOString()
    };
  });

  if (filters.status_filter && filters.status_filter !== 'all') {
    items = items.filter((it: any) => it.status === filters.status_filter);
  }
  if (filters.type && filters.type !== 'all') {
    items = items.filter((it: any) => it.type === filters.type || it.item_type === filters.type);
  }
  if (filters.category && filters.category !== 'all') {
    items = items.filter((it: any) => it.category === filters.category || it.category_id === filters.category);
  }
  if (filters.search) {
    const term = filters.search.toLowerCase();
    items = items.filter((it: any) => {
      const text = `${it.title || ''} ${it.description || ''} ${it.location || ''}`.toLowerCase();
      return text.includes(term);
    });
  }

  return items.sort((a: any, b: any) => (b.created_at || '').localeCompare(a.created_at || ''));
}

export async function getItemById(id: string): Promise<any | null> {
  if (aivenAvailable) {
    try {
      const pool = getAivenPool();
      const [rows] = await pool.query<any[]>(`
        SELECT i.item_id AS id, i.item_id AS item_id, i.title,
               i.item_type AS type, i.item_type AS item_type, i.description,
               i.event_date AS date, i.event_date AS event_date, i.image_url, i.status, i.created_at,
               COALESCE(c.category_name, 'General') AS category,
               COALESCE(c.category_name, 'General') AS category_name,
               i.category_id AS category_id,
               COALESCE(l.location_name, 'Campus') AS location,
               COALESCE(l.location_name, 'Campus') AS location_name,
               i.location_id AS location_id,
               s.student_id AS student_id, s.student_id AS reported_by,
               s.name AS student_name, s.email AS student_email,
               s.roll_no AS roll_no, s.roll_no AS student_roll_no,
               a.name AS reviewer_name
        FROM item i
        LEFT JOIN category c ON i.category_id = c.category_id
        LEFT JOIN location l ON i.location_id = l.location_id
        LEFT JOIN student s ON i.reported_by = s.student_id
        LEFT JOIN admin a ON i.reviewed_by = a.admin_id
        WHERE i.item_id = ? LIMIT 1
      `, [id]);
      if (rows && rows.length > 0) return rows[0];
    } catch (e) {
      aivenAvailable = false;
    }
  }

  const local = getLocalDb();
  let v = local.item?.[id];
  if (!v) {
    for (const [k, itemObj] of Object.entries(local.item || {})) {
      if (k === id || (itemObj as any).item_id === id || (itemObj as any).id === id) {
        v = itemObj;
        break;
      }
    }
  }

  if (v) {
    const cat = local.category?.[v.category_id]?.category_name || v.category || v.category_name || 'General';
    const loc = local.location?.[v.location_id]?.location_name || v.location || v.location_name || 'Campus';
    const std = local.student?.[v.reported_by || v.student_id] || {};
    const itemId = v.item_id || v.id || id;
    const itemType = v.item_type || v.type || 'lost';
    const eventDate = v.event_date || v.date || new Date().toISOString().slice(0, 10);
    return {
      id: itemId,
      item_id: itemId,
      title: v.title || 'Untitled',
      type: itemType,
      item_type: itemType,
      category: cat,
      category_name: cat,
      category_id: v.category_id || 'cat_elec',
      location: loc,
      location_name: loc,
      location_id: v.location_id || 'loc_lib',
      description: v.description || '',
      date: eventDate,
      event_date: eventDate,
      image_url: v.image_url || null,
      status: v.status || 'pending',
      student_id: v.reported_by || v.student_id || 'std_101',
      reported_by: v.reported_by || v.student_id || 'std_101',
      student_name: std.name || v.student_name || 'Student',
      student_email: std.email || v.student_email || '',
      roll_no: std.roll_no || v.roll_no || '',
      created_at: v.created_at || new Date().toISOString()
    };
  }
  return null;
}

export async function createItem(item: any): Promise<any> {
  const local = getLocalDb();

  // Resolve or create category
  let categoryId = item.category_id;
  let categoryName = item.category || 'General';
  if (!categoryId && item.category) {
    const foundCat = Object.values(local.category || {}).find(
      (c: any) => c.category_name.toLowerCase() === String(item.category).trim().toLowerCase()
    );
    if (foundCat) {
      categoryId = foundCat.category_id;
      categoryName = foundCat.category_name;
    } else {
      categoryId = `cat_${crypto.randomBytes(3).toString('hex')}`;
      categoryName = String(item.category).trim();
      if (!local.category) local.category = {};
      local.category[categoryId] = { category_id: categoryId, category_name: categoryName };
      if (aivenAvailable) {
        try {
          const pool = getAivenPool();
          await pool.query('INSERT IGNORE INTO category (category_id, category_name) VALUES (?, ?)', [categoryId, categoryName]);
        } catch {}
      }
    }
  }
  if (!categoryId) categoryId = 'cat_elec';

  // Resolve or create location
  let locationId = item.location_id;
  let locationName = item.location || 'Campus';
  if (!locationId && item.location) {
    const locText = String(item.location).trim();
    const foundLoc = Object.values(local.location || {}).find(
      (l: any) => l.location_name.toLowerCase() === locText.toLowerCase()
    );
    if (foundLoc) {
      locationId = foundLoc.location_id;
      locationName = foundLoc.location_name;
    } else {
      locationId = `loc_${crypto.randomBytes(3).toString('hex')}`;
      locationName = locText;
      if (!local.location) local.location = {};
      local.location[locationId] = { location_id: locationId, location_name: locationName };
      if (aivenAvailable) {
        try {
          const pool = getAivenPool();
          await pool.query('INSERT IGNORE INTO location (location_id, location_name) VALUES (?, ?)', [locationId, locationName]);
        } catch {}
      }
    }
  }
  if (!locationId) locationId = 'loc_lib';

  // Resolve or create student
  let studentId = item.student_id || item.reported_by || 'std_101';
  const foundStudent = Object.values(local.student || {}).find(
    (s: any) => s.student_id === studentId || s.roll_no === studentId || (item.student_email && s.email.toLowerCase() === item.student_email.toLowerCase())
  );
  if (foundStudent) {
    studentId = foundStudent.student_id;
  } else {
    // If not found in local student map, ensure student exists
    if (!local.student) local.student = {};
    local.student[studentId] = {
      student_id: studentId,
      roll_no: item.roll_no || `ROLL-${studentId}`,
      name: item.student_name || 'Student',
      email: item.student_email || `${studentId}@campus.edu`,
      password_hash: hashPassword('password123'),
      phone: '555-0100',
      department_id: 'dept_cs'
    };
    if (aivenAvailable) {
      try {
        const pool = getAivenPool();
        await pool.query(
          'INSERT IGNORE INTO student (student_id, roll_no, name, email, password_hash, phone, department_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [studentId, item.roll_no || `ROLL-${studentId}`, item.student_name || 'Student', item.student_email || `${studentId}@campus.edu`, hashPassword('password123'), '555-0100', 'dept_cs']
        );
      } catch {}
    }
  }

  const itemId = item.id || `item_${crypto.randomBytes(4).toString('hex')}`;
  const itemType = item.type || item.item_type || 'lost';
  const eventDate = item.date || item.event_date || new Date().toISOString().slice(0, 10);

  const normalized = {
    id: itemId,
    item_id: itemId,
    title: item.title,
    type: itemType,
    item_type: itemType,
    description: item.description,
    date: eventDate,
    event_date: eventDate,
    image_url: item.image_url || null,
    status: item.status || 'pending',
    category: categoryName,
    category_name: categoryName,
    category_id: categoryId,
    location: locationName,
    location_name: locationName,
    location_id: locationId,
    student_id: studentId,
    reported_by: studentId,
    student_name: item.student_name || foundStudent?.name || 'Student',
    student_email: item.student_email || foundStudent?.email || '',
    roll_no: foundStudent?.roll_no || '',
    reviewed_by: item.reviewed_by || null,
    created_at: new Date().toISOString()
  };

  if (aivenAvailable) {
    try {
      const pool = getAivenPool();
      await pool.query('INSERT IGNORE INTO category (category_id, category_name) VALUES (?, ?)', [categoryId, categoryName]);
      await pool.query('INSERT IGNORE INTO location (location_id, location_name) VALUES (?, ?)', [locationId, locationName]);
      await pool.query(
        'INSERT IGNORE INTO student (student_id, roll_no, name, email, password_hash, phone, department_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [studentId, normalized.roll_no || `ROLL-${studentId}`, normalized.student_name, normalized.student_email || `${studentId}@campus.edu`, hashPassword('password123'), '555-0100', 'dept_cs']
      );

      await pool.query(`
        INSERT INTO item (item_id, title, item_type, description, event_date, image_url, status, category_id, location_id, reported_by, reviewed_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `, [
        normalized.item_id,
        normalized.title,
        normalized.item_type,
        normalized.description,
        normalized.event_date,
        normalized.image_url,
        normalized.status,
        normalized.category_id,
        normalized.location_id,
        normalized.reported_by,
        normalized.reviewed_by
      ]);

      const logId = `log_${normalized.item_id}_${Date.now()}`;
      await pool.query(
        'INSERT INTO item_status_log (log_id, old_status, new_status, item_id) VALUES (?, NULL, ?, ?)',
        [logId, normalized.status, normalized.item_id]
      );
    } catch (e) {
      console.warn('[DB] Aiven item insert warning:', e);
      aivenAvailable = false;
    }
  }

  if (!local.item) local.item = {};
  local.item[itemId] = normalized;

  if (!local.item_status_log) local.item_status_log = {};
  const logId = `log_${itemId}_init`;
  local.item_status_log[logId] = {
    log_id: logId,
    old_status: null,
    new_status: normalized.status,
    item_id: itemId,
    changed_at: new Date().toISOString()
  };

  saveLocalDb(local);
  return normalized;
}

export async function updateItemStatus(id: string, status: string, adminId?: string): Promise<boolean> {
  const local = getLocalDb();
  let oldStatus = 'pending';
  let targetKey: string | null = null;
  const reviewerAdminId = adminId || 'adm_001';

  if (local.item?.[id]) {
    targetKey = id;
  } else {
    for (const [k, v] of Object.entries(local.item || {})) {
      if (k === id || (v as any).item_id === id || (v as any).id === id || String(k).toLowerCase() === id.toLowerCase()) {
        targetKey = k;
        break;
      }
    }
  }

  const existingItem = targetKey ? local.item?.[targetKey] : (local.item?.[id] || null);

  if (aivenAvailable) {
    try {
      const pool = getAivenPool();

      // Ensure admin exists in Aiven table
      await pool.query(
        'INSERT IGNORE INTO admin (admin_id, staff_code, name, email, password_hash, office_location, phone) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [reviewerAdminId, 'STAFF-SEC-01', 'Hariom Singh', 'hariom18august@gmail.com', hashPassword('admin123'), 'Student Activity Center Rm 104', '555-0199']
      );

      const [rows] = await pool.query<any[]>('SELECT status FROM item WHERE item_id = ? LIMIT 1', [id]);
      if (rows && rows.length > 0) {
        oldStatus = rows[0].status;
        await pool.query(
          'UPDATE item SET status = ?, reviewed_by = ? WHERE item_id = ?',
          [status, reviewerAdminId, id]
        );
      } else if (existingItem) {
        // Item was created while Aiven was offline; seed foreign keys and insert item
        oldStatus = existingItem.status || 'pending';
        const catId = existingItem.category_id || 'cat_elec';
        const locId = existingItem.location_id || 'loc_lib';
        const repId = existingItem.reported_by || existingItem.student_id || 'std_101';

        await pool.query('INSERT IGNORE INTO category (category_id, category_name) VALUES (?, ?)', [catId, existingItem.category || 'General']);
        await pool.query('INSERT IGNORE INTO location (location_id, location_name) VALUES (?, ?)', [locId, existingItem.location || 'Campus']);
        await pool.query(
          'INSERT IGNORE INTO student (student_id, roll_no, name, email, password_hash, phone, department_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [repId, existingItem.roll_no || `ROLL-${repId}`, existingItem.student_name || 'Student', existingItem.student_email || `${repId}@campus.edu`, hashPassword('password123'), '555-0100', 'dept_cs']
        );

        await pool.query(`
          INSERT INTO item (item_id, title, item_type, description, event_date, image_url, status, category_id, location_id, reported_by, reviewed_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
          ON DUPLICATE KEY UPDATE status = VALUES(status), reviewed_by = VALUES(reviewed_by)
        `, [
          id,
          existingItem.title || 'Belonging',
          existingItem.item_type || existingItem.type || 'lost',
          existingItem.description || '',
          existingItem.event_date || existingItem.date || new Date().toISOString().slice(0, 10),
          existingItem.image_url || null,
          status,
          catId,
          locId,
          repId,
          reviewerAdminId
        ]);
      }

      const logId = `log_${id}_${Date.now()}`;
      await pool.query(
        'INSERT INTO item_status_log (log_id, old_status, new_status, item_id) VALUES (?, ?, ?, ?)',
        [logId, oldStatus, status, id]
      );
    } catch (e) {
      console.warn('[DB] Aiven status update warning:', e);
      aivenAvailable = false;
    }
  }

  if (targetKey && local.item?.[targetKey]) {
    oldStatus = local.item[targetKey].status || 'pending';
    local.item[targetKey].status = status;
    local.item[targetKey].reviewed_by = reviewerAdminId;
  } else {
    local.item[id] = { id, item_id: id, status, reviewed_by: reviewerAdminId };
  }

  if (!local.item_status_log) local.item_status_log = {};
  const logId = `log_${id}_${Date.now()}`;
  local.item_status_log[logId] = {
    log_id: logId,
    old_status: oldStatus,
    new_status: status,
    item_id: id,
    changed_at: new Date().toISOString()
  };

  saveLocalDb(local);
  return true;
}

export async function deleteItem(id: string): Promise<boolean> {
  if (aivenAvailable) {
    try {
      const pool = getAivenPool();
      await pool.query('DELETE FROM item_status_log WHERE item_id = ?', [id]);
      await pool.query('DELETE FROM claim WHERE item_id = ?', [id]);
      await pool.query('DELETE FROM item WHERE item_id = ?', [id]);
    } catch (e) {
      aivenAvailable = false;
    }
  }

  const local = getLocalDb();
  if (local.item?.[id]) {
    delete local.item[id];
  } else {
    for (const [k, v] of Object.entries(local.item || {})) {
      if (k === id || (v as any).item_id === id) {
        delete local.item[k];
        break;
      }
    }
  }
  if (local.claim) {
    for (const [k, c] of Object.entries(local.claim)) {
      if ((c as any).item_id === id) delete local.claim[k];
    }
  }
  if (local.item_status_log) {
    for (const [k, l] of Object.entries(local.item_status_log)) {
      if ((l as any).item_id === id) delete local.item_status_log[k];
    }
  }
  saveLocalDb(local);
  return true;
}

export async function getStudentReports(studentIdOrEmail: any): Promise<any[]> {
  const all = await getItems({});
  const aliases = new Set<string>();

  if (typeof studentIdOrEmail === 'object' && studentIdOrEmail !== null) {
    if (studentIdOrEmail.id) aliases.add(String(studentIdOrEmail.id).trim().toLowerCase());
    if (studentIdOrEmail.student_id) aliases.add(String(studentIdOrEmail.student_id).trim().toLowerCase());
    if (studentIdOrEmail.roll_no) aliases.add(String(studentIdOrEmail.roll_no).trim().toLowerCase());
    if (studentIdOrEmail.email) aliases.add(String(studentIdOrEmail.email).trim().toLowerCase());
  } else if (studentIdOrEmail) {
    aliases.add(String(studentIdOrEmail).trim().toLowerCase());
  }

  // Pre-seed known campus student aliases
  if (aliases.has('std_101') || aliases.has('cs202401') || aliases.has('arth@campus.edu')) {
    aliases.add('std_101');
    aliases.add('cs202401');
    aliases.add('arth@campus.edu');
  }
  if (aliases.has('std_102') || aliases.has('ec202415') || aliases.has('shivam@campus.edu')) {
    aliases.add('std_102');
    aliases.add('ec202415');
    aliases.add('shivam@campus.edu');
  }

  const local = getLocalDb();
  for (const s of Object.values(local.student || {})) {
    const sid = String((s as any).student_id || '').toLowerCase();
    const sroll = String((s as any).roll_no || '').toLowerCase();
    const semail = String((s as any).email || '').toLowerCase();
    if (aliases.has(sid) || aliases.has(sroll) || aliases.has(semail)) {
      if (sid) aliases.add(sid);
      if (sroll) aliases.add(sroll);
      if (semail) aliases.add(semail);
    }
  }

  return all.filter(it => {
    const sId = String(it.student_id || '').toLowerCase();
    const repBy = String(it.reported_by || '').toLowerCase();
    const sEmail = String(it.student_email || '').toLowerCase();
    const rollNo = String(it.roll_no || it.student_roll_no || '').toLowerCase();
    return aliases.has(sId) || aliases.has(repBy) || aliases.has(sEmail) || aliases.has(rollNo);
  });
}

export async function getStudentClaims(studentIdOrEmail: any): Promise<any[]> {
  const all = await getAllClaims();
  const aliases = new Set<string>();

  if (typeof studentIdOrEmail === 'object' && studentIdOrEmail !== null) {
    if (studentIdOrEmail.id) aliases.add(String(studentIdOrEmail.id).trim().toLowerCase());
    if (studentIdOrEmail.student_id) aliases.add(String(studentIdOrEmail.student_id).trim().toLowerCase());
    if (studentIdOrEmail.roll_no) aliases.add(String(studentIdOrEmail.roll_no).trim().toLowerCase());
    if (studentIdOrEmail.email) aliases.add(String(studentIdOrEmail.email).trim().toLowerCase());
  } else if (studentIdOrEmail) {
    aliases.add(String(studentIdOrEmail).trim().toLowerCase());
  }

  if (aliases.has('std_101') || aliases.has('cs202401') || aliases.has('arth@campus.edu')) {
    aliases.add('std_101');
    aliases.add('cs202401');
    aliases.add('arth@campus.edu');
  }
  if (aliases.has('std_102') || aliases.has('ec202415') || aliases.has('shivam@campus.edu')) {
    aliases.add('std_102');
    aliases.add('ec202415');
    aliases.add('shivam@campus.edu');
  }

  const local = getLocalDb();
  for (const s of Object.values(local.student || {})) {
    const sid = String((s as any).student_id || '').toLowerCase();
    const sroll = String((s as any).roll_no || '').toLowerCase();
    const semail = String((s as any).email || '').toLowerCase();
    if (aliases.has(sid) || aliases.has(sroll) || aliases.has(semail)) {
      if (sid) aliases.add(sid);
      if (sroll) aliases.add(sroll);
      if (semail) aliases.add(semail);
    }
  }

  return all.filter(c => {
    const sId = String(c.student_id || '').toLowerCase();
    const sEmail = String(c.student_email || '').toLowerCase();
    const rollNo = String(c.roll_no || '').toLowerCase();
    return aliases.has(sId) || aliases.has(sEmail) || aliases.has(rollNo);
  });
}

export async function getAllClaims(): Promise<any[]> {
  if (aivenAvailable) {
    try {
      const pool = getAivenPool();
      const [rows] = await pool.query<any[]>(`
        SELECT c.claim_id AS id, c.proof_description, c.contact_phone, c.status, c.created_at,
               c.item_id, i.title AS item_title,
               c.student_id, s.name AS student_name, s.email AS student_email, s.roll_no AS roll_no,
               a.name AS reviewer_name
        FROM claim c
        LEFT JOIN item i ON c.item_id = i.item_id
        LEFT JOIN student s ON c.student_id = s.student_id
        LEFT JOIN admin a ON c.reviewed_by = a.admin_id
        ORDER BY c.created_at DESC
      `);
      return rows;
    } catch (e) {
      aivenAvailable = false;
    }
  }

  const local = getLocalDb();
  return (Object.values(local.claim || {}) as any[]).map(c => {
    const item = local.item?.[c.item_id] || {};
    const std = local.student?.[c.student_id] || {};
    return {
      id: c.claim_id,
      proof_description: c.proof_description,
      contact_phone: c.contact_phone,
      status: c.status,
      item_id: c.item_id,
      item_title: item.title || c.item_title,
      student_id: c.student_id,
      student_name: std.name || c.student_name,
      student_email: std.email || c.student_email,
      roll_no: std.roll_no,
      created_at: c.created_at
    };
  }).sort((a: any, b: any) => (b.created_at || '').localeCompare(a.created_at || ''));
}

export async function createClaim(claim: {
  id: string;
  item_id: string;
  item_title?: string;
  student_id: string;
  student_name?: string;
  student_email?: string;
  proof_description: string;
  contact_phone: string;
  status?: string;
}): Promise<any> {
  const local = getLocalDb();

  // Enforce candidate key (item_id, student_id)
  const existing = (Object.values(local.claim || {}) as any[]).find(
    c => c.item_id === claim.item_id && c.student_id === claim.student_id
  );
  if (existing) {
    throw new Error('You have already submitted an ownership claim for this item.');
  }

  if (aivenAvailable) {
    try {
      const pool = getAivenPool();

      // Ensure student exists
      await pool.query(
        'INSERT IGNORE INTO student (student_id, roll_no, name, email, password_hash, phone, department_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [claim.student_id, `ROLL-${claim.student_id}`, claim.student_name || 'Student', claim.student_email || `${claim.student_id}@campus.edu`, hashPassword('password123'), claim.contact_phone || '555-0100', 'dept_cs']
      );

      // Ensure item exists in Aiven
      const [itRows] = await pool.query<any[]>('SELECT item_id FROM item WHERE item_id = ? LIMIT 1', [claim.item_id]);
      if (itRows.length === 0 && local.item?.[claim.item_id]) {
        const it = local.item[claim.item_id];
        await pool.query('INSERT IGNORE INTO category (category_id, category_name) VALUES (?, ?)', [it.category_id || 'cat_elec', it.category || 'General']);
        await pool.query('INSERT IGNORE INTO location (location_id, location_name) VALUES (?, ?)', [it.location_id || 'loc_lib', it.location || 'Campus']);
        await pool.query(`
          INSERT INTO item (item_id, title, item_type, description, event_date, image_url, status, category_id, location_id, reported_by, reviewed_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
          ON DUPLICATE KEY UPDATE status=VALUES(status)
        `, [
          claim.item_id,
          it.title || 'Belonging',
          it.item_type || it.type || 'found',
          it.description || '',
          it.event_date || it.date || new Date().toISOString().slice(0, 10),
          it.image_url || null,
          it.status || 'approved',
          it.category_id || 'cat_elec',
          it.location_id || 'loc_lib',
          it.reported_by || it.student_id || 'std_101',
          null
        ]);
      }

      await pool.query(`
        INSERT INTO claim (claim_id, proof_description, contact_phone, status, item_id, student_id, reviewed_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, NULL, NOW())
      `, [
        claim.id,
        claim.proof_description,
        claim.contact_phone,
        claim.status || 'pending',
        claim.item_id,
        claim.student_id
      ]);
    } catch (e: any) {
      if (e.code === 'ER_DUP_ENTRY' || String(e).includes('uq_claim_item_student')) {
        throw new Error('You have already submitted an ownership claim for this item.');
      }
      console.warn('[DB] Aiven claim insert warning:', e);
      aivenAvailable = false;
    }
  }

  if (!local.claim) local.claim = {};
  local.claim[claim.id] = {
    claim_id: claim.id,
    proof_description: claim.proof_description,
    contact_phone: claim.contact_phone,
    status: claim.status || 'pending',
    item_id: claim.item_id,
    item_title: claim.item_title,
    student_id: claim.student_id,
    student_name: claim.student_name,
    student_email: claim.student_email,
    created_at: new Date().toISOString()
  };
  saveLocalDb(local);
  return claim;
}

export async function updateClaimStatus(claimId: string, status: string, adminId?: string): Promise<boolean> {
  let itemId: string | null = null;
  const local = getLocalDb();
  const reviewerAdminId = adminId || 'adm_001';

  if (aivenAvailable) {
    try {
      const pool = getAivenPool();

      // Ensure admin exists
      await pool.query(
        'INSERT IGNORE INTO admin (admin_id, staff_code, name, email, password_hash, office_location, phone) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [reviewerAdminId, 'STAFF-SEC-01', 'Hariom Singh', 'hariom18august@gmail.com', hashPassword('admin123'), 'Student Activity Center Rm 104', '555-0199']
      );

      const [rows] = await pool.query<any[]>('SELECT item_id FROM claim WHERE claim_id = ? LIMIT 1', [claimId]);
      if (rows && rows.length > 0) {
        itemId = rows[0].item_id;
        await pool.query('UPDATE claim SET status = ?, reviewed_by = ? WHERE claim_id = ?', [status, reviewerAdminId, claimId]);
      } else {
        const cl = local.claim?.[claimId];
        if (cl) {
          itemId = cl.item_id;
          await pool.query(`
            INSERT INTO claim (claim_id, proof_description, contact_phone, status, item_id, student_id, reviewed_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE status = VALUES(status), reviewed_by = VALUES(reviewed_by)
          `, [
            claimId,
            cl.proof_description,
            cl.contact_phone,
            status,
            cl.item_id,
            cl.student_id,
            reviewerAdminId
          ]);
        }
      }

      if (status === 'approved' && itemId) {
        await pool.query('UPDATE item SET status = ?, reviewed_by = ? WHERE item_id = ?', ['claimed', reviewerAdminId, itemId]);
        const logId = `log_${itemId}_${Date.now()}`;
        await pool.query(
          'INSERT INTO item_status_log (log_id, old_status, new_status, item_id) VALUES (?, ?, ?, ?)',
          [logId, 'approved', 'claimed', itemId]
        );
      }
    } catch (e) {
      console.warn('[DB] Aiven claim update warning:', e);
      aivenAvailable = false;
    }
  }

  if (local.claim?.[claimId]) {
    local.claim[claimId].status = status;
    local.claim[claimId].reviewed_by = adminId || 'adm_001';
    const cid = local.claim[claimId].item_id;
    if (status === 'approved' && cid && local.item?.[cid]) {
      const oldStatus = local.item[cid].status;
      local.item[cid].status = 'claimed';
      local.item[cid].reviewed_by = adminId || 'adm_001';

      if (!local.item_status_log) local.item_status_log = {};
      const logId = `log_${cid}_${Date.now()}`;
      local.item_status_log[logId] = {
        log_id: logId,
        old_status: oldStatus,
        new_status: 'claimed',
        item_id: cid,
        changed_at: new Date().toISOString()
      };
    }
    saveLocalDb(local);
  }
  return true;
}

export async function getItemStatusLogs(itemId: string): Promise<any[]> {
  if (aivenAvailable) {
    try {
      const pool = getAivenPool();
      const [rows] = await pool.query<any[]>(
        'SELECT * FROM item_status_log WHERE item_id = ? ORDER BY changed_at DESC',
        [itemId]
      );
      return rows;
    } catch (e) {
      aivenAvailable = false;
    }
  }

  const local = getLocalDb();
  return (Object.values(local.item_status_log || {}) as any[])
    .filter(l => l.item_id === itemId)
    .sort((a: any, b: any) => (b.changed_at || '').localeCompare(a.changed_at || ''));
}

export async function getAdminStats(): Promise<{
  total_students: number;
  lost_items: number;
  found_items: number;
  pending_reports: number;
  pending_claims: number;
}> {
  if (aivenAvailable) {
    try {
      const pool = getAivenPool();
      const [[{ students_cnt }]] = await pool.query<any[]>('SELECT COUNT(*) AS students_cnt FROM student');
      const [[{ lost_cnt }]] = await pool.query<any[]>("SELECT COUNT(*) AS lost_cnt FROM item WHERE item_type = 'lost'");
      const [[{ found_cnt }]] = await pool.query<any[]>("SELECT COUNT(*) AS found_cnt FROM item WHERE item_type = 'found'");
      const [[{ pending_reports_cnt }]] = await pool.query<any[]>("SELECT COUNT(*) AS pending_reports_cnt FROM item WHERE status = 'pending'");
      const [[{ pending_claims_cnt }]] = await pool.query<any[]>("SELECT COUNT(*) AS pending_claims_cnt FROM claim WHERE status = 'pending'");

      return {
        total_students: Number(students_cnt),
        lost_items: Number(lost_cnt),
        found_items: Number(found_cnt),
        pending_reports: Number(pending_reports_cnt),
        pending_claims: Number(pending_claims_cnt)
      };
    } catch (e) {
      aivenAvailable = false;
    }
  }

  const local = getLocalDb();
  const students = Object.values(local.student || {});
  const items = Object.values(local.item || {});
  const claims = Object.values(local.claim || {});

  return {
    total_students: students.length,
    lost_items: items.filter((i: any) => (i.item_type || i.type) === 'lost').length,
    found_items: items.filter((i: any) => (i.item_type || i.type) === 'found').length,
    pending_reports: items.filter((i: any) => i.status === 'pending').length,
    pending_claims: claims.filter((c: any) => c.status === 'pending').length
  };
}

export async function executeQuery<T = any>(sql: string, params: any[] = []): Promise<T> {
  const pool = getAivenPool();
  const [results] = await pool.execute(sql, params);
  return results as T;
}

export async function initializeAivenSchema(schemaFilePath?: string): Promise<{
  success: boolean;
  executedStatements: number;
  message: string;
}> {
  const targetPath = schemaFilePath || path.resolve(process.cwd(), 'database', 'schema_defaultdb.sql');
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Schema file not found at ${targetPath}`);
  }

  const rawSql = fs.readFileSync(targetPath, 'utf-8');
  const pool = getAivenPool();
  const connection = await pool.getConnection();

  try {
    const statements = rawSql
      .split(/;\s*$/m)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'));

    let count = 0;
    for (const statement of statements) {
      if (statement.length > 0) {
        await connection.query(statement);
        count++;
      }
    }

    return {
      success: true,
      executedStatements: count,
      message: `Successfully executed ${count} statements from schema on Aiven MySQL`,
    };
  } finally {
    connection.release();
  }
}

export async function closeAivenPool(): Promise<void> {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = null;
  }
}
