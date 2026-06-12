import { pgTable, serial, varchar, text, boolean, timestamp, integer, foreignKey } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const aiConfigurations = pgTable("ai_configurations", {
	id: serial().primaryKey().notNull(),
	name: varchar({ length: 100 }).notNull(),
	providerType: varchar("provider_type", { length: 20 }).default('custom').notNull(),
	apiUrl: varchar("api_url", { length: 500 }).notNull(),
	modelId: varchar("model_id", { length: 100 }).notNull(),
	apiKey: text("api_key").notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const operationLogs = pgTable("operation_logs", {
	id: serial().primaryKey().notNull(),
	action: varchar({ length: 20 }).notNull(),
	entityType: varchar("entity_type", { length: 20 }).notNull(),
	entityId: integer("entity_id").notNull(),
	details: text().notNull(),
	status: varchar({ length: 20 }).notNull(),
	errorMessage: text("error_message"),
	createdBy: varchar("created_by", { length: 100 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const domains = pgTable("domains", {
	id: serial().primaryKey().notNull(),
	providerId: integer("provider_id").notNull(),
	name: varchar({ length: 255 }).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	lastSyncedAt: timestamp("last_synced_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.providerId],
			foreignColumns: [dnsProviders.id],
			name: "domains_provider_id_dns_providers_id_fk"
		}).onDelete("cascade"),
]);

export const dnsRecords = pgTable("dns_records", {
	id: serial().primaryKey().notNull(),
	domainId: integer("domain_id").notNull(),
	type: varchar({ length: 10 }).notNull(),
	name: varchar({ length: 255 }).notNull(),
	content: text().notNull(),
	ttl: integer().default(600).notNull(),
	priority: integer(),
	providerRecordId: varchar("provider_record_id", { length: 255 }),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.domainId],
			foreignColumns: [domains.id],
			name: "dns_records_domain_id_domains_id_fk"
		}).onDelete("cascade"),
]);

export const dnsProviders = pgTable("dns_providers", {
	id: serial().primaryKey().notNull(),
	name: varchar({ length: 100 }).notNull(),
	type: varchar({ length: 20 }).notNull(),
	credentials: text().notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});
