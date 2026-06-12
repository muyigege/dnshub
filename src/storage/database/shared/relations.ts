import { relations } from "drizzle-orm/relations";
import { dnsProviders, domains, dnsRecords } from "./schema";

export const domainsRelations = relations(domains, ({one, many}) => ({
	dnsProvider: one(dnsProviders, {
		fields: [domains.providerId],
		references: [dnsProviders.id]
	}),
	dnsRecords: many(dnsRecords),
}));

export const dnsProvidersRelations = relations(dnsProviders, ({many}) => ({
	domains: many(domains),
}));

export const dnsRecordsRelations = relations(dnsRecords, ({one}) => ({
	domain: one(domains, {
		fields: [dnsRecords.domainId],
		references: [domains.id]
	}),
}));