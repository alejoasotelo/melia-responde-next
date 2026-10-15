import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  integer,
  bigint,
  unique,
  index,
  numeric,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 20 }).notNull().default('member'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

export const teams = pgTable('teams', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  // MercadoPago preapproval (subscription) id
  mpSubscriptionId: text('mp_subscription_id').unique(),
  planName: varchar('plan_name', { length: 50 }),
  subscriptionStatus: varchar('subscription_status', { length: 20 }),
});

export const teamMembers = pgTable('team_members', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  role: varchar('role', { length: 50 }).notNull(),
  joinedAt: timestamp('joined_at').notNull().defaultNow(),
});

export const activityLogs = pgTable('activity_logs', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  userId: integer('user_id').references(() => users.id),
  action: text('action').notNull(),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  ipAddress: varchar('ip_address', { length: 45 }),
});

export const invitations = pgTable('invitations', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  email: varchar('email', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull(),
  invitedBy: integer('invited_by')
    .notNull()
    .references(() => users.id),
  invitedAt: timestamp('invited_at').notNull().defaultNow(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
});

// One row per (team, MercadoLibre account): the same MercadoLibre account can
// be linked to several teams (e.g. an agency taking over from another), each
// with its own tokens, drafts and listing context.
export const meliAccounts = pgTable(
  'meli_accounts',
  {
    id: serial('id').primaryKey(),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id),
    connectedBy: integer('connected_by').references(() => users.id),
    meliUserId: bigint('meli_user_id', { mode: 'number' }).notNull(),
    nickname: varchar('nickname', { length: 100 }),
    siteId: varchar('site_id', { length: 10 }),
    // Encrypted with lib/meli/crypto.ts, never store these in plain text.
    accessToken: text('access_token').notNull(),
    refreshToken: text('refresh_token'),
    tokenExpiresAt: timestamp('token_expires_at').notNull(),
    questionsSyncedAt: timestamp('questions_synced_at'),
    itemsSyncedAt: timestamp('items_synced_at'),
    // Lock so only one sync runs per account at a time.
    syncStartedAt: timestamp('sync_started_at'),
    lastSyncError: text('last_sync_error'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [unique().on(t.teamId, t.meliUserId)]
);

// Local copy of the account's listings, refreshed by lib/meli/sync.ts.
export const meliItems = pgTable(
  'meli_items',
  {
    id: serial('id').primaryKey(),
    meliAccountId: integer('meli_account_id')
      .notNull()
      .references(() => meliAccounts.id, { onDelete: 'cascade' }),
    itemId: varchar('item_id', { length: 20 }).notNull(),
    title: text('title').notNull(),
    thumbnail: text('thumbnail'),
    permalink: text('permalink'),
    price: numeric('price', { precision: 14, scale: 2 }),
    currencyId: varchar('currency_id', { length: 10 }),
    availableQuantity: integer('available_quantity'),
    // active | paused | closed | ... ; 'unlisted' = no longer returned by MercadoLibre
    status: varchar('status', { length: 20 }).notNull().default('active'),
    syncedAt: timestamp('synced_at').notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.meliAccountId, t.itemId),
    index('meli_items_account_status_idx').on(t.meliAccountId, t.status),
  ]
);

// Local copy of questions. Rows are never deleted: this is the history.
export const meliQuestions = pgTable(
  'meli_questions',
  {
    id: serial('id').primaryKey(),
    meliAccountId: integer('meli_account_id')
      .notNull()
      .references(() => meliAccounts.id, { onDelete: 'cascade' }),
    meliQuestionId: bigint('meli_question_id', { mode: 'number' }).notNull(),
    itemId: varchar('item_id', { length: 20 }).notNull(),
    text: text('text').notNull(),
    // UNANSWERED | ANSWERED | CLOSED_UNANSWERED | UNDER_REVIEW | BANNED | DELETED | ...
    status: varchar('status', { length: 30 }).notNull(),
    fromUserId: bigint('from_user_id', { mode: 'number' }),
    dateCreated: timestamp('date_created').notNull(),
    answerText: text('answer_text'),
    answerDate: timestamp('answer_date'),
    firstSeenAt: timestamp('first_seen_at').notNull().defaultNow(),
    syncedAt: timestamp('synced_at').notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.meliAccountId, t.meliQuestionId),
    index('meli_questions_account_status_idx').on(
      t.meliAccountId,
      t.status,
      t.dateCreated
    ),
  ]
);

// Answers published from this app (one row per question; retries update it).
export const answerSubmissions = pgTable(
  'answer_submissions',
  {
    id: serial('id').primaryKey(),
    meliAccountId: integer('meli_account_id')
      .notNull()
      .references(() => meliAccounts.id, { onDelete: 'cascade' }),
    meliQuestionId: bigint('meli_question_id', { mode: 'number' }).notNull(),
    text: text('text').notNull(),
    sentBy: integer('sent_by').references(() => users.id),
    sentAt: timestamp('sent_at').notNull().defaultNow(),
    batchId: varchar('batch_id', { length: 36 }).notNull(),
    // pending | sent | failed | skipped
    status: varchar('status', { length: 10 }).notNull(),
    error: text('error'),
  },
  (t) => [unique().on(t.meliAccountId, t.meliQuestionId)]
);

// Extra text the seller writes per listing; fed to the AI when drafting answers.
export const meliItemContexts = pgTable(
  'meli_item_contexts',
  {
    id: serial('id').primaryKey(),
    meliAccountId: integer('meli_account_id')
      .notNull()
      .references(() => meliAccounts.id, { onDelete: 'cascade' }),
    itemId: varchar('item_id', { length: 20 }).notNull(),
    context: text('context').notNull(),
    updatedBy: integer('updated_by').references(() => users.id),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [unique().on(t.meliAccountId, t.itemId)]
);

export const questionDrafts = pgTable(
  'question_drafts',
  {
    id: serial('id').primaryKey(),
    meliAccountId: integer('meli_account_id')
      .notNull()
      .references(() => meliAccounts.id, { onDelete: 'cascade' }),
    meliQuestionId: bigint('meli_question_id', { mode: 'number' }).notNull(),
    itemId: varchar('item_id', { length: 20 }).notNull(),
    draft: text('draft').notNull(),
    createdBy: integer('created_by').references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [unique().on(t.meliAccountId, t.meliQuestionId)]
);

export const teamsRelations = relations(teams, ({ many }) => ({
  meliAccounts: many(meliAccounts),
  teamMembers: many(teamMembers),
  activityLogs: many(activityLogs),
  invitations: many(invitations),
}));

export const usersRelations = relations(users, ({ many }) => ({
  teamMembers: many(teamMembers),
  invitationsSent: many(invitations),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  team: one(teams, {
    fields: [invitations.teamId],
    references: [teams.id],
  }),
  invitedBy: one(users, {
    fields: [invitations.invitedBy],
    references: [users.id],
  }),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  user: one(users, {
    fields: [teamMembers.userId],
    references: [users.id],
  }),
  team: one(teams, {
    fields: [teamMembers.teamId],
    references: [teams.id],
  }),
}));


export const meliAccountsRelations = relations(meliAccounts, ({ one }) => ({
  team: one(teams, {
    fields: [meliAccounts.teamId],
    references: [teams.id],
  }),
  connectedByUser: one(users, {
    fields: [meliAccounts.connectedBy],
    references: [users.id],
  }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  team: one(teams, {
    fields: [activityLogs.teamId],
    references: [teams.id],
  }),
  user: one(users, {
    fields: [activityLogs.userId],
    references: [users.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type TeamMember = typeof teamMembers.$inferSelect;
export type NewTeamMember = typeof teamMembers.$inferInsert;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type NewActivityLog = typeof activityLogs.$inferInsert;
export type MeliAccount = typeof meliAccounts.$inferSelect;
export type NewMeliAccount = typeof meliAccounts.$inferInsert;
export type MeliItem = typeof meliItems.$inferSelect;
export type MeliQuestionRow = typeof meliQuestions.$inferSelect;
export type AnswerSubmission = typeof answerSubmissions.$inferSelect;
export type MeliItemContext = typeof meliItemContexts.$inferSelect;
export type QuestionDraft = typeof questionDrafts.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
export type TeamDataWithMembers = Team & {
  teamMembers: (TeamMember & {
    user: Pick<User, 'id' | 'name' | 'email'>;
  })[];
};

export enum ActivityType {
  SIGN_UP = 'SIGN_UP',
  SIGN_IN = 'SIGN_IN',
  SIGN_OUT = 'SIGN_OUT',
  UPDATE_PASSWORD = 'UPDATE_PASSWORD',
  DELETE_ACCOUNT = 'DELETE_ACCOUNT',
  UPDATE_ACCOUNT = 'UPDATE_ACCOUNT',
  CREATE_TEAM = 'CREATE_TEAM',
  REMOVE_TEAM_MEMBER = 'REMOVE_TEAM_MEMBER',
  INVITE_TEAM_MEMBER = 'INVITE_TEAM_MEMBER',
  ACCEPT_INVITATION = 'ACCEPT_INVITATION',
  CONNECT_MELI_ACCOUNT = 'CONNECT_MELI_ACCOUNT',
  DISCONNECT_MELI_ACCOUNT = 'DISCONNECT_MELI_ACCOUNT',
  SEND_MELI_ANSWERS = 'SEND_MELI_ANSWERS',
}
