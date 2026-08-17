/**
 * lib/db.js — MySQL connection pool (mysql2/promise)
 *
 * Kompatibel dengan MySQL 5.7, MySQL 8.x, dan MariaDB 10.x
 * (Pterodactyl biasanya pakai salah satu dari ini)
 *
 * Konfigurasi via env var:
 *   MYSQL_HOST     — hostname MySQL (default: localhost)
 *   MYSQL_PORT     — port MySQL    (default: 3306)
 *   MYSQL_USER     — username MySQL
 *   MYSQL_PASSWORD — password MySQL
 *   MYSQL_DATABASE — nama database
 */

import mysql from 'mysql2/promise';

// Singleton pool — bertahan selama proses Node.js hidup
const g = globalThis;
if (!g._mysqlPool) g._mysqlPool = null;
if (!g._mysqlReady) g._mysqlReady = false;

export function getPool() {
  if (g._mysqlPool) return g._mysqlPool;

  if (
    !process.env.MYSQL_HOST ||
    !process.env.MYSQL_USER ||
    !process.env.MYSQL_DATABASE
  ) {
    return null;
  }

  g._mysqlPool = mysql.createPool({
    host:               process.env.MYSQL_HOST     || 'localhost',
    port:     parseInt(process.env.MYSQL_PORT      || '3306'),
    user:               process.env.MYSQL_USER,
    password:           process.env.MYSQL_PASSWORD || '',
    database:           process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit:    10,
    queueLimit:         0,
    // Agar kolom JSON otomatis di-parse menjadi object JS
    typeCast(field, next) {
      if (field.type === 'JSON') {
        const val = field.string();
        try { return val ? JSON.parse(val) : null; } catch { return val; }
      }
      return next();
    },
  });

  console.log('[db] MySQL pool created:', process.env.MYSQL_HOST, process.env.MYSQL_DATABASE);
  return g._mysqlPool;
}

export const hasDB = () => !!(
  process.env.MYSQL_HOST &&
  process.env.MYSQL_USER &&
  process.env.MYSQL_DATABASE
);

/**
 * Buat semua tabel jika belum ada.
 * DDL kompatibel MySQL 5.7 / MariaDB 10.x — tanpa functional index.
 * Dipanggil di setiap fungsi DB pertama kali (idempotent).
 */
export async function ensureTables() {
  // Sudah diinisialisasi di run ini
  if (g._mysqlReady) return;

  const pool = getPool();
  if (!pool) return;

  // Tandai sebelum query agar tidak double-run jika dipanggil bersamaan
  g._mysqlReady = true;

  const ddls = [
    // ── settings ──────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS \`settings\` (
       \`key\`        VARCHAR(255) NOT NULL,
       \`value\`      LONGTEXT     NOT NULL,
       PRIMARY KEY (\`key\`)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // ── categories ────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS \`categories\` (
       \`id\`         INT          NOT NULL AUTO_INCREMENT,
       \`data\`       LONGTEXT     NOT NULL,
       \`created_at\` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
       PRIMARY KEY (\`id\`)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // ── products ──────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS \`products\` (
       \`id\`         INT          NOT NULL AUTO_INCREMENT,
       \`data\`       LONGTEXT     NOT NULL,
       \`created_at\` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
       PRIMARY KEY (\`id\`)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // ── orders ────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS \`orders\` (
       \`order_id\`   VARCHAR(255) NOT NULL,
       \`data\`       LONGTEXT     NOT NULL,
       \`created_at\` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
       \`updated_at\` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       PRIMARY KEY (\`order_id\`)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // ── redeem_codes ──────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS \`redeem_codes\` (
       \`id\`         INT          NOT NULL AUTO_INCREMENT,
       \`code\`       VARCHAR(255) NOT NULL,
       \`data\`       LONGTEXT     NOT NULL,
       \`created_at\` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
       PRIMARY KEY (\`id\`),
       UNIQUE KEY \`uq_code\` (\`code\`)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // ── tickets ───────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS \`tickets\` (
       \`ticket_id\`  VARCHAR(255) NOT NULL,
       \`data\`       LONGTEXT     NOT NULL,
       \`created_at\` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
       \`updated_at\` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       PRIMARY KEY (\`ticket_id\`)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ];

  let conn;
  try {
    conn = await pool.getConnection();
    for (const ddl of ddls) {
      await conn.query(ddl);
    }
    console.log('[db] Tables ready');
  } catch (e) {
    // Reset flag agar retry saat request berikutnya
    g._mysqlReady = false;
    console.error('[db] ensureTables error:', e.message);
    throw e;   // lempar ke pemanggil agar terlihat di log
  } finally {
    if (conn) conn.release();
  }
}
