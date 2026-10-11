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
        ON DUPLICATE KEY UPDATE status=VALUES(status)
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
        SELECT i.item_id AS id, i.title, i.item_type AS type, i.description,
               i.event_date AS date, i.image_url, i.status, i.created_at,
               c.category_name AS category, l.location_name AS location,
               s.student_id AS student_id, s.name AS student_name, s.email AS student_email, s.roll_no AS student_roll_no,
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
        sql += ' AND (LOWER(i.title) LIKE ? OR LOWER(i.description) LIKE ? OR LOWER(l.location_name) LIKE ?)';
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
    const std = local.student?.[v.reported_by] || {};
    return {
      id: v.item_id || k,
      title: v.title,
      type: v.item_type || v.type,
      category: cat,
      category_id: v.category_id,
      location: loc,
      location_id: v.location_id,
      description: v.description,
      date: v.event_date || v.date,
      image_url: v.image_url,
      status: v.status,
      student_id: v.reported_by || v.student_id,
      student_name: std.name || v.student_name,
      student_email: std.email || v.student_email,
      created_at: v.created_at
    };
  });

  if (filters.status_filter && filters.status_filter !== 'all') {
    items = items.filter((it: any) => it.status === filters.status_filter);
  }
  if (filters.type && filters.type !== 'all') {
    items = items.filter((it: any) => it.type === filters.type);
  }
  if (filters.category && filters.category !== 'all') {
    items = items.filter((it: any) => it.category === filters.category);
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
        SELECT i.item_id AS id, i.title, i.item_type AS type, i.description,
               i.event_date AS date, i.image_url, i.status, i.created_at,
               c.category_name AS category, l.location_name AS location,
               s.student_id AS student_id, s.name AS student_name, s.email AS student_email, s.roll_no AS student_roll_no,
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
  const v = local.item?.[id];
  if (v) {
    const cat = local.category?.[v.category_id]?.category_name || v.category || 'General';
    const loc = local.location?.[v.location_id]?.location_name || v.location || 'Campus';
    const std = local.student?.[v.reported_by] || {};
    return {
      id: v.item_id || id,
      title: v.title,
      type: v.item_type || v.type,
      category: cat,
      location: loc,
      description: v.description,
      date: v.event_date || v.date,
      image_url: v.image_url,
      status: v.status,
      student_id: v.reported_by || v.student_id,
      student_name: std.name || v.student_name,
      student_email: std.email || v.student_email,
      created_at: v.created_at
    };
  }
  return null;
}

export async function createItem(item: any): Promise<any> {
  const local = getLocalDb();

  // Resolve category_id and location_id
  let categoryId = item.category_id;
  if (!categoryId && item.category) {
    const foundCat = Object.values(local.category || {}).find((c: any) => c.category_name.toLowerCase() === item.category.toLowerCase());
    categoryId = foundCat?.category_id || 'cat_elec';
  }
  let locationId = item.location_id;
  if (!locationId && item.location) {
    const foundLoc = Object.values(local.location || {}).find((l: any) => l.location_name.toLowerCase().includes(item.location.toLowerCase()));
    locationId = foundLoc?.location_id || 'loc_lib';
  }

  const normalized = {
    item_id: item.id,
    title: item.title,
    item_type: item.type,
    description: item.description,
    event_date: item.date,
    image_url: item.image_url,
    status: item.status || 'pending',
    category_id: categoryId || 'cat_elec',
    location_id: locationId || 'loc_lib',
    reported_by: item.student_id || 'std_101',
    reviewed_by: item.reviewed_by || null,
    created_at: new Date().toISOString()
  };

  if (aivenAvailable) {
    try {
      const pool = getAivenPool();
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

      // Insert initial log
      const logId = `log_${normalized.item_id}_${Date.now()}`;
      await pool.query(
        'INSERT INTO item_status_log (log_id, old_status, new_status, item_id) VALUES (?, NULL, ?, ?)',
        [logId, normalized.status, normalized.item_id]
      );
    } catch (e) {
      aivenAvailable = false;
    }
  }

  if (!local.item) local.item = {};
  local.item[item.id] = {
    ...normalized,
    category: item.category || 'General',
    location: item.location || 'Campus',
    student_name: item.student_name,
    student_email: item.student_email
  };

  // Local log
  if (!local.item_status_log) local.item_status_log = {};
  local.item_status_log[`log_${item.id}_init`] = {
    log_id: `log_${item.id}_init`,
    old_status: null,
    new_status: normalized.status,
    item_id: item.id,
    changed_at: new Date().toISOString()
  };

  saveLocalDb(local);
  return { id: item.id, ...normalized };
}

export async function updateItemStatus(id: string, status: string, adminId?: string): Promise<boolean> {
  const local = getLocalDb();
  let oldStatus = 'pending';

  if (aivenAvailable) {
    try {
      const pool = getAivenPool();
      const [rows] = await pool.query<any[]>('SELECT status FROM item WHERE item_id = ? LIMIT 1', [id]);
      if (rows && rows.length > 0) oldStatus = rows[0].status;

      await pool.query(
        'UPDATE item SET status = ?, reviewed_by = ? WHERE item_id = ?',
        [status, adminId || 'adm_001', id]
      );

      // Audit status change
      const logId = `log_${id}_${Date.now()}`;
      await pool.query(
        'INSERT INTO item_status_log (log_id, old_status, new_status, item_id) VALUES (?, ?, ?, ?)',
        [logId, oldStatus, status, id]
      );
    } catch (e) {
      aivenAvailable = false;
    }
  }

  if (local.item?.[id]) {
    oldStatus = local.item[id].status || 'pending';
    local.item[id].status = status;
    local.item[id].reviewed_by = adminId || 'adm_001';
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
  if (local.item?.[id]) delete local.item[id];
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

export async function getStudentReports(studentId: string): Promise<any[]> {
  return getItems({}).then(all => all.filter(it => it.student_id === studentId || it.reported_by === studentId));
}

export async function getStudentClaims(studentId: string): Promise<any[]> {
  return getAllClaims().then(claims => claims.filter(c => c.student_id === studentId));
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

  if (aivenAvailable) {
    try {
      const pool = getAivenPool();
      const [rows] = await pool.query<any[]>('SELECT item_id FROM claim WHERE claim_id = ? LIMIT 1', [claimId]);
      if (rows && rows.length > 0) itemId = rows[0].item_id;

      await pool.query('UPDATE claim SET status = ?, reviewed_by = ? WHERE claim_id = ?', [status, adminId || 'adm_001', claimId]);

      if (status === 'approved' && itemId) {
        await pool.query('UPDATE item SET status = ?, reviewed_by = ? WHERE item_id = ?', ['claimed', adminId || 'adm_001', itemId]);
        const logId = `log_${itemId}_${Date.now()}`;
        await pool.query(
          'INSERT INTO item_status_log (log_id, old_status, new_status, item_id) VALUES (?, ?, ?, ?)',
          [logId, 'approved', 'claimed', itemId]
        );
      }
    } catch (e) {
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
