import mysql, { Pool, PoolConnection } from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ override: true });

export interface AivenConfig {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  uri?: string;
  caCert?: string;
  rejectUnauthorized?: boolean;
}

let poolInstance: Pool | null = null;

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
      // ignore url parse failure
    }
  }

  const host = uriHost || process.env.AIVEN_MYSQL_HOST || process.env.MYSQL_HOST || process.env.DB_HOST;
  const port = uriPort || parseInt(
    process.env.AIVEN_MYSQL_PORT || process.env.MYSQL_PORT || process.env.DB_PORT || '3306',
    10
  );
  const user = uriUser || process.env.AIVEN_MYSQL_USER || process.env.MYSQL_USER || process.env.DB_USER || 'avnadmin';
  const password = uriPassword || process.env.AIVEN_MYSQL_PASSWORD || process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || '';
  const database = uriDatabase || process.env.AIVEN_MYSQL_DATABASE || process.env.MYSQL_DATABASE || process.env.DB_NAME || 'defaultdb';

  let caCert: string | undefined = process.env.AIVEN_MYSQL_CA_CERT;
  const caPath = process.env.AIVEN_MYSQL_CA_PATH;
  if (!caCert && caPath && fs.existsSync(caPath)) {
    caCert = fs.readFileSync(caPath, 'utf-8');
  }

  const rejectUnauthorized = process.env.AIVEN_MYSQL_REJECT_UNAUTHORIZED !== 'false';

  return {
    uri,
    host,
    port,
    user,
    password,
    database,
    caCert,
    rejectUnauthorized,
  };
}

export function getAivenPool(customConfig?: AivenConfig): Pool {
  if (poolInstance && !customConfig) {
    return poolInstance;
  }

  const config = customConfig || resolveAivenConfig();

  const sslOptions: mysql.SslOptions = {
    rejectUnauthorized: config.rejectUnauthorized ?? true,
  };

  if (config.caCert) {
    sslOptions.ca = config.caCert;
  }

  if (config.host && config.password) {
    poolInstance = mysql.createPool({
      host: config.host,
      port: config.port || 3306,
      user: config.user || 'avnadmin',
      password: config.password,
      database: config.database || 'defaultdb',
      ssl: sslOptions,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      multipleStatements: true,
    });
    return poolInstance;
  }

  if (config.uri) {
    // Strip query parameters that mysql2 warns about like ssl-mode
    const cleanUri = config.uri.split('?')[0];
    poolInstance = mysql.createPool({
      uri: cleanUri,
      ssl: sslOptions,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      multipleStatements: true,
    });
    return poolInstance;
  }

  poolInstance = mysql.createPool({
    host: config.host || 'localhost',
    port: config.port || 3306,
    user: config.user || 'avnadmin',
    password: config.password || '',
    database: config.database || 'defaultdb',
    ssl: sslOptions,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    multipleStatements: true,
  });

  return poolInstance;
}

export async function testAivenConnection(customConfig?: AivenConfig): Promise<{
  success: boolean;
  message: string;
  version?: string;
  database?: string;
}> {
  try {
    const pool = getAivenPool(customConfig);
    const connection: PoolConnection = await pool.getConnection();

    try {
      const [rows] = await connection.query<any[]>('SELECT VERSION() AS version, DATABASE() AS db_name, NOW() AS server_time');
      const row = rows[0] || {};
      return {
        success: true,
        message: 'Connected to Aiven MySQL successfully!',
        version: row.version,
        database: row.db_name,
      };
    } finally {
      connection.release();
    }
  } catch (error: any) {
    return {
      success: false,
      message: `Connection failed: ${error.message || error}`,
    };
  }
}

export async function executeQuery<T = any>(
  sql: string,
  params: any[] = []
): Promise<T> {
  const pool = getAivenPool();
  const [results] = await pool.execute(sql, params);
  return results as T;
}

export async function initializeAivenSchema(schemaFilePath?: string): Promise<{
  success: boolean;
  executedStatements: number;
  message: string;
}> {
  const targetPath = schemaFilePath || path.resolve(process.cwd(), 'database', 'schema.sql');

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
      message: `Successfully executed ${count} statements from schema.sql on Aiven MySQL`,
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
