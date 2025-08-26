import { 
  serial, 
  text, 
  pgTable, 
  timestamp, 
  numeric, 
  integer, 
  boolean,
  pgEnum,
  jsonb
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const productCategoryEnum = pgEnum('product_category', [
  'mobile_credit',
  'data_package', 
  'pln_token',
  'game_voucher',
  'other'
]);

export const transactionStatusEnum = pgEnum('transaction_status', [
  'pending',
  'processing', 
  'success',
  'failed',
  'cancelled'
]);

export const denominationTypeEnum = pgEnum('denomination_type', [
  'fixed',
  'range'
]);

// Users table
export const usersTable = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  password_hash: text('password_hash').notNull(),
  full_name: text('full_name').notNull(),
  phone_number: text('phone_number'),
  referral_code: text('referral_code').notNull().unique(),
  referred_by_id: integer('referred_by_id'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Products table
export const productsTable = pgTable('products', {
  id: serial('id').primaryKey(),
  sku: text('sku').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  category: productCategoryEnum('category').notNull(),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  base_price: numeric('base_price', { precision: 10, scale: 2 }).notNull(),
  provider: text('provider').notNull(),
  is_active: boolean('is_active').notNull().default(true),
  min_amount: numeric('min_amount', { precision: 10, scale: 2 }),
  max_amount: numeric('max_amount', { precision: 10, scale: 2 }),
  denomination_type: denominationTypeEnum('denomination_type').notNull().default('fixed'),
  image_url: text('image_url'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Transactions table
export const transactionsTable = pgTable('transactions', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull(),
  product_id: integer('product_id').notNull(),
  transaction_id: text('transaction_id').notNull().unique(),
  external_transaction_id: text('external_transaction_id'),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  status: transactionStatusEnum('status').notNull().default('pending'),
  customer_phone: text('customer_phone'),
  customer_id: text('customer_id'),
  customer_name: text('customer_name'),
  notes: text('notes'),
  digiflazz_response: jsonb('digiflazz_response'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Referrals table
export const referralsTable = pgTable('referrals', {
  id: serial('id').primaryKey(),
  referrer_id: integer('referrer_id').notNull(),
  referred_id: integer('referred_id').notNull(),
  commission_amount: numeric('commission_amount', { precision: 10, scale: 2 }).notNull(),
  transaction_id: integer('transaction_id').notNull(),
  is_paid: boolean('is_paid').notNull().default(false),
  created_at: timestamp('created_at').defaultNow().notNull()
});

// Relations
export const usersRelations = relations(usersTable, ({ one, many }) => ({
  referrer: one(usersTable, {
    fields: [usersTable.referred_by_id],
    references: [usersTable.id],
    relationName: 'referrer'
  }),
  referrals: many(usersTable, {
    relationName: 'referrer'
  }),
  transactions: many(transactionsTable),
  referralsMade: many(referralsTable, {
    relationName: 'referrer'
  }),
  referralsReceived: many(referralsTable, {
    relationName: 'referred'
  })
}));

export const productsRelations = relations(productsTable, ({ many }) => ({
  transactions: many(transactionsTable)
}));

export const transactionsRelations = relations(transactionsTable, ({ one, many }) => ({
  user: one(usersTable, {
    fields: [transactionsTable.user_id],
    references: [usersTable.id]
  }),
  product: one(productsTable, {
    fields: [transactionsTable.product_id],
    references: [productsTable.id]
  }),
  referrals: many(referralsTable)
}));

export const referralsRelations = relations(referralsTable, ({ one }) => ({
  referrer: one(usersTable, {
    fields: [referralsTable.referrer_id],
    references: [usersTable.id],
    relationName: 'referrer'
  }),
  referred: one(usersTable, {
    fields: [referralsTable.referred_id],
    references: [usersTable.id],
    relationName: 'referred'
  }),
  transaction: one(transactionsTable, {
    fields: [referralsTable.transaction_id],
    references: [transactionsTable.id]
  })
}));

// TypeScript types for the table schemas
export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;

export type Product = typeof productsTable.$inferSelect;
export type NewProduct = typeof productsTable.$inferInsert;

export type Transaction = typeof transactionsTable.$inferSelect;
export type NewTransaction = typeof transactionsTable.$inferInsert;

export type Referral = typeof referralsTable.$inferSelect;
export type NewReferral = typeof referralsTable.$inferInsert;

// Export all tables and relations for proper query building
export const tables = { 
  users: usersTable, 
  products: productsTable, 
  transactions: transactionsTable,
  referrals: referralsTable
};

export const tableRelations = {
  usersRelations,
  productsRelations,
  transactionsRelations,
  referralsRelations
};