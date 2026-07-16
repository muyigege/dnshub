import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import path from 'path';
import fs from 'fs';

// Using a file-based SQLite database in a data directory for Docker volume mounting
const dataDir = path.resolve(process.cwd(), 'data');
const sqlitePath = path.resolve(dataDir, 'local.sqlite');

// Lazy initialization — only connect when db is first accessed
let _client: ReturnType<typeof createClient> | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

function getClient() {
  if (!_client) {
    // Ensure data directory exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    _client = createClient({
      url: `file:${sqlitePath}`,
    });

    // Auto-provision tables if they don't exist
    _client.executeMultiple(`
CREATE TABLE IF NOT EXISTS \`ai_configurations\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`name\` text NOT NULL,
	\`provider_type\` text DEFAULT 'custom' NOT NULL,
	\`api_url\` text NOT NULL,
	\`model_id\` text NOT NULL,
	\`api_key\` text NOT NULL,
	\`is_active\` integer DEFAULT true NOT NULL,
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	\`updated_at\` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
CREATE TABLE IF NOT EXISTS \`dns_providers\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`name\` text NOT NULL,
	\`type\` text NOT NULL,
	\`credentials\` text NOT NULL,
	\`is_active\` integer DEFAULT true NOT NULL,
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	\`updated_at\` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
CREATE TABLE IF NOT EXISTS \`dns_records\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`domain_id\` integer NOT NULL,
	\`type\` text NOT NULL,
	\`name\` text NOT NULL,
	\`content\` text NOT NULL,
	\`ttl\` integer DEFAULT 600 NOT NULL,
	\`priority\` integer,
	\`provider_record_id\` text,
	\`is_active\` integer DEFAULT true NOT NULL,
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	\`updated_at\` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (\`domain_id\`) REFERENCES \`domains\`(\`id\`) ON UPDATE no action ON DELETE cascade
);
CREATE TABLE IF NOT EXISTS \`domains\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`provider_id\` integer NOT NULL,
	\`name\` text NOT NULL,
	\`is_active\` integer DEFAULT true NOT NULL,
	\`last_synced_at\` text,
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	\`updated_at\` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (\`provider_id\`) REFERENCES \`dns_providers\`(\`id\`) ON UPDATE no action ON DELETE cascade
);
CREATE TABLE IF NOT EXISTS \`operation_logs\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`action\` text NOT NULL,
	\`entity_type\` text NOT NULL,
	\`entity_id\` integer NOT NULL,
	\`details\` text NOT NULL,
	\`status\` text NOT NULL,
	\`error_message\` text,
	\`created_by\` text,
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
`).catch((err) => console.error("Failed to auto-provision db tables:", err));

    // Migration: add extended columns to operation_logs (idempotent)
    // SQLite doesn't support ADD COLUMN IF NOT EXISTS, so we catch the "duplicate column" error per statement.
    const migrationColumns: Array<[string, string]> = [
      ['batch_id', 'text'],
      ['parent_operation_id', 'integer'],
      ['source', "text DEFAULT 'system' NOT NULL"],
      ['actor', 'text'],
      ['client_name', 'text'],
      ['request_id', 'text'],
      ['idempotency_key', 'text'],
      ['provider_id', 'integer'],
      ['domain_id', 'integer'],
      ['record_id', 'integer'],
      ['before_snapshot', 'text'],
      ['requested_snapshot', 'text'],
      ['after_snapshot', 'text'],
      ['started_at', 'text'],
      ['completed_at', 'text'],
      ['rollback_of', 'integer'],
      ['rolled_back_at', 'text'],
      ['error_code', 'text'],
    ];
    for (const [col, type] of migrationColumns) {
      _client.execute(`ALTER TABLE \`operation_logs\` ADD COLUMN \`${col}\` ${type}`)
        .catch((err: unknown) => {
          // Ignore "duplicate column name" errors (column already exists)
          const msg = err instanceof Error ? err.message : String(err);
          if (!msg.includes('duplicate column') && !msg.toLowerCase().includes('already exists')) {
            console.error(`Failed to migrate operation_logs.${col}:`, err);
          }
        });
    }

    // Migration: add proxied/proxiable/version columns to dns_records (idempotent)
    // version 为乐观锁版本号，用于 updateRecord/deleteRecord 的 TOCTOU 并发保护
    const dnsRecordMigrationColumns: Array<[string, string]> = [
      ['proxied', 'integer'],
      ['proxiable', 'integer'],
      ['version', 'integer DEFAULT 0 NOT NULL'],
    ];
    for (const [col, type] of dnsRecordMigrationColumns) {
      _client.execute(`ALTER TABLE \`dns_records\` ADD COLUMN \`${col}\` ${type}`)
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          if (!msg.includes('duplicate column') && !msg.toLowerCase().includes('already exists')) {
            console.error(`Failed to migrate dns_records.${col}:`, err);
          }
        });
    }
  }
  return _client;
}

function getDb() {
  if (!_db) {
    _db = drizzle(getClient());
  }
  return _db;
}

// Export a proxy that lazily initializes the db
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop) {
    return (getDb() as any)[prop];
  },
});

export default db;
