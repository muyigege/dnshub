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
