/**
 * VisitorTrack — database schema
 *
 * RULES (from CLAUDE.md and ADR-0006):
 * - Every business table has tenant_id NOT NULL.
 * - Every business table has an index that starts with tenant_id (or includes it
 *   as the first column of a composite unique index).
 * - This file is human-controlled. Claude Code does not edit it without an
 *   explicit prompt that names this file.
 * - When you change this file, run `pnpm db:generate` to produce a migration,
 *   review the SQL, commit migration + schema together.
 */

import {
  pgTable,
  bigserial,
  bigint,
  varchar,
  text,
  timestamp,
  boolean,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const userRole = pgEnum('user_role', ['guard', 'admin', 'super_admin'])

export const visitStatus = pgEnum('visit_status', [
  'pending',
  'asked_to_wait',
  'approved',
  'rejected',
  'checked_in',
  'checked_out',
  'expired',
])

export const routingType = pgEnum('routing_type', ['group', 'user', 'auto_pass'])

export const passType = pgEnum('pass_type', [
  'single_use',
  'date_range',
  'weekdays',
  'time_window',
])

export const requestSource = pgEnum('request_source', [
  'public_form',
  'guard',
  'pass',
])

// ---------------------------------------------------------------------------
// Tenants
// ---------------------------------------------------------------------------

export const tenants = pgTable('tenants', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  slug: varchar('slug', { length: 64 }).notNull().unique(),
  name: varchar('name', { length: 256 }).notNull(),
  // typed via TenantConfigSchema in src/lib/schemas/tenant-config.ts
  config: jsonb('config').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const users = pgTable(
  'users',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenantId: bigint('tenant_id', { mode: 'number' })
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    email: varchar('email', { length: 320 }),
    phone: varchar('phone', { length: 20 }),
    name: varchar('name', { length: 256 }).notNull(),
    // null = magic-link-only account (no password set)
    passwordHash: text('password_hash'),
    role: userRole('role').notNull().default('admin'),
    isActive: boolean('is_active').notNull().default(true),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantEmailIdx: uniqueIndex('users_tenant_email_idx').on(t.tenantId, t.email),
    tenantPhoneIdx: index('users_tenant_phone_idx').on(t.tenantId, t.phone),
    tenantRoleIdx: index('users_tenant_role_idx').on(t.tenantId, t.role),
  }),
)

// ---------------------------------------------------------------------------
// Admin groups (Office, Teachers, Management, Operations, ...)
// ---------------------------------------------------------------------------

export const adminGroups = pgTable(
  'admin_groups',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenantId: bigint('tenant_id', { mode: 'number' })
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 128 }).notNull(),
    slug: varchar('slug', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantSlugIdx: uniqueIndex('admin_groups_tenant_slug_idx').on(t.tenantId, t.slug),
  }),
)

// Many-to-many: a user can be in many groups, a group has many users
export const userGroups = pgTable(
  'user_groups',
  {
    tenantId: bigint('tenant_id', { mode: 'number' })
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    groupId: bigint('group_id', { mode: 'number' })
      .notNull()
      .references(() => adminGroups.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.groupId] }),
    tenantIdx: index('user_groups_tenant_idx').on(t.tenantId),
    groupIdx: index('user_groups_group_idx').on(t.groupId),
  }),
)

// ---------------------------------------------------------------------------
// Visit types (config: "Parent — PTM", "Vendor", "Contractor", "Guest of Staff")
// ---------------------------------------------------------------------------

export const visitTypes = pgTable(
  'visit_types',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenantId: bigint('tenant_id', { mode: 'number' })
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 128 }).notNull(),
    slug: varchar('slug', { length: 64 }).notNull(),
    // default routing applied when guard picks this type and doesn't override
    defaultRoutingType: routingType('default_routing_type'),
    defaultGroupId: bigint('default_group_id', { mode: 'number' }).references(
      () => adminGroups.id,
      { onDelete: 'set null' },
    ),
    defaultUserId: bigint('default_user_id', { mode: 'number' }).references(
      () => users.id,
      { onDelete: 'set null' },
    ),
    // free-form: array of required field keys, e.g. ['vehicleNumber', 'idNumber']
    requiredFields: jsonb('required_fields').notNull().default([]),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: bigint('sort_order', { mode: 'number' }).notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantSlugIdx: uniqueIndex('visit_types_tenant_slug_idx').on(t.tenantId, t.slug),
    tenantActiveIdx: index('visit_types_tenant_active_idx').on(t.tenantId, t.isActive),
  }),
)

// ---------------------------------------------------------------------------
// Access passes (pre-approved bypass; guard scans/enters code → auto-approve)
// ---------------------------------------------------------------------------

export const accessPasses = pgTable(
  'access_passes',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenantId: bigint('tenant_id', { mode: 'number' })
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    code: varchar('code', { length: 16 }).notNull(),
    visitorName: varchar('visitor_name', { length: 256 }).notNull(),
    visitorPhone: varchar('visitor_phone', { length: 20 }).notNull(),
    purpose: text('purpose'),
    passType: passType('pass_type').notNull(),
    // common validity window
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull(),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    // for 'weekdays': ['mon','wed','fri']
    daysOfWeek: jsonb('days_of_week'),
    // for 'time_window': 'HH:mm' strings, local tenant time
    dailyStartTime: varchar('daily_start_time', { length: 5 }),
    dailyEndTime: varchar('daily_end_time', { length: 5 }),
    // null = unlimited within validity window
    usesAllowed: bigint('uses_allowed', { mode: 'number' }),
    usesConsumed: bigint('uses_consumed', { mode: 'number' }).notNull().default(0),
    isRevoked: boolean('is_revoked').notNull().default(false),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedByUserId: bigint('revoked_by_user_id', { mode: 'number' }).references(
      () => users.id,
      { onDelete: 'set null' },
    ),
    issuedByUserId: bigint('issued_by_user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    // user ids to notify (in-app + SMS) on every successful use of this pass
    notifyAdminUserIds: jsonb('notify_admin_user_ids').notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantCodeIdx: uniqueIndex('access_passes_tenant_code_idx').on(t.tenantId, t.code),
    tenantActiveIdx: index('access_passes_tenant_active_idx').on(
      t.tenantId,
      t.isRevoked,
      t.validUntil,
    ),
  }),
)

// ---------------------------------------------------------------------------
// Visit requests — the approval workflow record
// ---------------------------------------------------------------------------

export const visitRequests = pgTable(
  'visit_requests',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenantId: bigint('tenant_id', { mode: 'number' })
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),

    // public-facing lookup code (shown to visitor; guard types it in)
    code: varchar('code', { length: 12 }).notNull(),

    // visitor snapshot (denormalised; we don't have a visitors table in MVP)
    visitorName: varchar('visitor_name', { length: 256 }).notNull(),
    visitorPhone: varchar('visitor_phone', { length: 20 }).notNull(),
    visitorEmail: varchar('visitor_email', { length: 320 }),
    purpose: text('purpose').notNull(),
    visitTypeId: bigint('visit_type_id', { mode: 'number' }).references(
      () => visitTypes.id,
      { onDelete: 'set null' },
    ),

    // host (the person being visited; either a registered user or just a name)
    hostName: varchar('host_name', { length: 256 }),
    hostUserId: bigint('host_user_id', { mode: 'number' }).references(() => users.id, {
      onDelete: 'set null',
    }),

    // routing
    routingType: routingType('routing_type').notNull(),
    routedGroupId: bigint('routed_group_id', { mode: 'number' }).references(
      () => adminGroups.id,
      { onDelete: 'set null' },
    ),
    routedUserId: bigint('routed_user_id', { mode: 'number' }).references(
      () => users.id,
      { onDelete: 'set null' },
    ),
    // frozen list of user ids who could act at request creation time
    // shape: { userIds: number[], capturedAt: string }
    routingSnapshot: jsonb('routing_snapshot').notNull(),

    // status + decision
    status: visitStatus('status').notNull().default('pending'),
    decidedByUserId: bigint('decided_by_user_id', { mode: 'number' }).references(
      () => users.id,
      { onDelete: 'set null' },
    ),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionNote: text('decision_note'),

    // parcel: drop-off without entry
    hasParcel: boolean('has_parcel').notNull().default(false),
    parcelNote: text('parcel_note'),

    // source
    source: requestSource('source').notNull(),
    createdByUserId: bigint('created_by_user_id', { mode: 'number' }).references(
      () => users.id,
      { onDelete: 'set null' },
    ),
    accessPassId: bigint('access_pass_id', { mode: 'number' }).references(
      () => accessPasses.id,
      { onDelete: 'set null' },
    ),

    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantCodeIdx: uniqueIndex('visit_requests_tenant_code_idx').on(t.tenantId, t.code),
    tenantStatusIdx: index('visit_requests_tenant_status_idx').on(t.tenantId, t.status),
    tenantRoutedUserIdx: index('visit_requests_tenant_routed_user_idx').on(
      t.tenantId,
      t.routedUserId,
      t.status,
    ),
    tenantRoutedGroupIdx: index('visit_requests_tenant_routed_group_idx').on(
      t.tenantId,
      t.routedGroupId,
      t.status,
    ),
    tenantCreatedIdx: index('visit_requests_tenant_created_idx').on(
      t.tenantId,
      t.createdAt,
    ),
  }),
)

// ---------------------------------------------------------------------------
// Visits — the actual check-in / check-out event (created from an approved request)
// ---------------------------------------------------------------------------

export const visits = pgTable(
  'visits',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenantId: bigint('tenant_id', { mode: 'number' })
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    requestId: bigint('request_id', { mode: 'number' })
      .notNull()
      .references(() => visitRequests.id, { onDelete: 'restrict' }),

    photoUrl: text('photo_url'), // R2 key
    badgeNumber: varchar('badge_number', { length: 32 }).notNull(),

    checkedInAt: timestamp('checked_in_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    checkedInByUserId: bigint('checked_in_by_user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    checkedOutAt: timestamp('checked_out_at', { withTimezone: true }),
    checkedOutByUserId: bigint('checked_out_by_user_id', { mode: 'number' }).references(
      () => users.id,
      { onDelete: 'set null' },
    ),
  },
  (t) => ({
    tenantBadgeIdx: uniqueIndex('visits_tenant_badge_idx').on(t.tenantId, t.badgeNumber),
    tenantCheckedInIdx: index('visits_tenant_checked_in_idx').on(
      t.tenantId,
      t.checkedInAt,
    ),
    tenantOpenIdx: index('visits_tenant_open_idx').on(t.tenantId, t.checkedOutAt),
  }),
)

// ---------------------------------------------------------------------------
// Audit log — every state-changing action
// ---------------------------------------------------------------------------

export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenantId: bigint('tenant_id', { mode: 'number' })
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    // null actor = system event (cron, webhook, expiry)
    actorUserId: bigint('actor_user_id', { mode: 'number' }).references(() => users.id, {
      onDelete: 'set null',
    }),
    // e.g. 'visit_request.created', 'visit_request.approved', 'pass.issued'
    action: varchar('action', { length: 64 }).notNull(),
    entityType: varchar('entity_type', { length: 32 }).notNull(),
    entityId: bigint('entity_id', { mode: 'number' }).notNull(),
    // diff / context — never PII unless needed
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantEntityIdx: index('audit_log_tenant_entity_idx').on(
      t.tenantId,
      t.entityType,
      t.entityId,
    ),
    tenantCreatedIdx: index('audit_log_tenant_created_idx').on(
      t.tenantId,
      t.createdAt,
    ),
  }),
)

// ---------------------------------------------------------------------------
// Notifications — in-app feed (auto-dismiss "resolved by other" within 24h)
// ---------------------------------------------------------------------------

export const notifications = pgTable(
  'notifications',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenantId: bigint('tenant_id', { mode: 'number' })
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // 'request.routed_to_you' | 'request.resolved_by_other' | 'pass.used' | ...
    type: varchar('type', { length: 64 }).notNull(),
    title: varchar('title', { length: 256 }).notNull(),
    body: text('body'),
    relatedEntityType: varchar('related_entity_type', { length: 32 }),
    relatedEntityId: bigint('related_entity_id', { mode: 'number' }),
    readAt: timestamp('read_at', { withTimezone: true }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    // for the 24h auto-dismiss "resolved by other" feed items
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantUserCreatedIdx: index('notifications_tenant_user_created_idx').on(
      t.tenantId,
      t.userId,
      t.createdAt,
    ),
    tenantUserUnreadIdx: index('notifications_tenant_user_unread_idx').on(
      t.tenantId,
      t.userId,
      t.readAt,
    ),
  }),
)

// ---------------------------------------------------------------------------
// Relations (for type-safe joins via db.query.X.findMany({ with: ... }))
// ---------------------------------------------------------------------------

export const tenantsRelations = relations(tenants, ({ many }) => ({
  users: many(users),
  adminGroups: many(adminGroups),
  visitTypes: many(visitTypes),
  visitRequests: many(visitRequests),
  accessPasses: many(accessPasses),
}))

export const usersRelations = relations(users, ({ one, many }) => ({
  tenant: one(tenants, { fields: [users.tenantId], references: [tenants.id] }),
  groups: many(userGroups),
  issuedPasses: many(accessPasses, { relationName: 'pass_issuer' }),
}))

export const adminGroupsRelations = relations(adminGroups, ({ one, many }) => ({
  tenant: one(tenants, { fields: [adminGroups.tenantId], references: [tenants.id] }),
  members: many(userGroups),
}))

export const userGroupsRelations = relations(userGroups, ({ one }) => ({
  user: one(users, { fields: [userGroups.userId], references: [users.id] }),
  group: one(adminGroups, {
    fields: [userGroups.groupId],
    references: [adminGroups.id],
  }),
}))

export const visitTypesRelations = relations(visitTypes, ({ one }) => ({
  tenant: one(tenants, { fields: [visitTypes.tenantId], references: [tenants.id] }),
  defaultGroup: one(adminGroups, {
    fields: [visitTypes.defaultGroupId],
    references: [adminGroups.id],
  }),
  defaultUser: one(users, {
    fields: [visitTypes.defaultUserId],
    references: [users.id],
  }),
}))

export const visitRequestsRelations = relations(visitRequests, ({ one, many }) => ({
  tenant: one(tenants, { fields: [visitRequests.tenantId], references: [tenants.id] }),
  visitType: one(visitTypes, {
    fields: [visitRequests.visitTypeId],
    references: [visitTypes.id],
  }),
  routedGroup: one(adminGroups, {
    fields: [visitRequests.routedGroupId],
    references: [adminGroups.id],
  }),
  routedUser: one(users, {
    fields: [visitRequests.routedUserId],
    references: [users.id],
    relationName: 'request_routed_user',
  }),
  decidedBy: one(users, {
    fields: [visitRequests.decidedByUserId],
    references: [users.id],
    relationName: 'request_decider',
  }),
  hostUser: one(users, {
    fields: [visitRequests.hostUserId],
    references: [users.id],
    relationName: 'request_host',
  }),
  pass: one(accessPasses, {
    fields: [visitRequests.accessPassId],
    references: [accessPasses.id],
  }),
  visits: many(visits),
}))

export const visitsRelations = relations(visits, ({ one }) => ({
  tenant: one(tenants, { fields: [visits.tenantId], references: [tenants.id] }),
  request: one(visitRequests, {
    fields: [visits.requestId],
    references: [visitRequests.id],
  }),
  checkedInBy: one(users, {
    fields: [visits.checkedInByUserId],
    references: [users.id],
    relationName: 'visit_checkin',
  }),
  checkedOutBy: one(users, {
    fields: [visits.checkedOutByUserId],
    references: [users.id],
    relationName: 'visit_checkout',
  }),
}))

export const accessPassesRelations = relations(accessPasses, ({ one }) => ({
  tenant: one(tenants, { fields: [accessPasses.tenantId], references: [tenants.id] }),
  issuedBy: one(users, {
    fields: [accessPasses.issuedByUserId],
    references: [users.id],
    relationName: 'pass_issuer',
  }),
  revokedBy: one(users, {
    fields: [accessPasses.revokedByUserId],
    references: [users.id],
    relationName: 'pass_revoker',
  }),
}))

// ---------------------------------------------------------------------------
// Inferred types — import these elsewhere, don't redeclare
// ---------------------------------------------------------------------------

export type Tenant = typeof tenants.$inferSelect
export type NewTenant = typeof tenants.$inferInsert

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

export type AdminGroup = typeof adminGroups.$inferSelect
export type NewAdminGroup = typeof adminGroups.$inferInsert

export type VisitType = typeof visitTypes.$inferSelect
export type NewVisitType = typeof visitTypes.$inferInsert

export type VisitRequest = typeof visitRequests.$inferSelect
export type NewVisitRequest = typeof visitRequests.$inferInsert

export type Visit = typeof visits.$inferSelect
export type NewVisit = typeof visits.$inferInsert

export type AccessPass = typeof accessPasses.$inferSelect
export type NewAccessPass = typeof accessPasses.$inferInsert

export type AuditLogEntry = typeof auditLog.$inferSelect
export type NewAuditLogEntry = typeof auditLog.$inferInsert

export type Notification = typeof notifications.$inferSelect
export type NewNotification = typeof notifications.$inferInsert
