import { z } from 'zod';

// User schema
export const userSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  password_hash: z.string(),
  full_name: z.string(),
  phone_number: z.string().nullable(),
  referral_code: z.string(),
  referred_by_id: z.number().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type User = z.infer<typeof userSchema>;

// User input schemas
export const registerInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().min(1),
  phone_number: z.string().nullable().optional(),
  referral_code: z.string().optional()
});

export type RegisterInput = z.infer<typeof registerInputSchema>;

export const loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

export type LoginInput = z.infer<typeof loginInputSchema>;

// Product category enum
export const productCategorySchema = z.enum([
  'mobile_credit',
  'data_package',
  'pln_token',
  'game_voucher',
  'other'
]);

export type ProductCategory = z.infer<typeof productCategorySchema>;

// Product schema
export const productSchema = z.object({
  id: z.number(),
  sku: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  category: productCategorySchema,
  price: z.number(),
  base_price: z.number(),
  provider: z.string(),
  is_active: z.boolean(),
  min_amount: z.number().nullable(),
  max_amount: z.number().nullable(),
  denomination_type: z.enum(['fixed', 'range']),
  image_url: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Product = z.infer<typeof productSchema>;

// Transaction status enum
export const transactionStatusSchema = z.enum([
  'pending',
  'processing',
  'success',
  'failed',
  'cancelled'
]);

export type TransactionStatus = z.infer<typeof transactionStatusSchema>;

// Transaction schema
export const transactionSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  product_id: z.number(),
  transaction_id: z.string(),
  external_transaction_id: z.string().nullable(),
  amount: z.number(),
  price: z.number(),
  status: transactionStatusSchema,
  customer_phone: z.string().nullable(),
  customer_id: z.string().nullable(),
  customer_name: z.string().nullable(),
  notes: z.string().nullable(),
  digiflazz_response: z.record(z.any()).nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Transaction = z.infer<typeof transactionSchema>;

// Transaction input schemas
export const createTransactionInputSchema = z.object({
  user_id: z.number(),
  product_id: z.number(),
  amount: z.number().optional(),
  customer_phone: z.string().nullable().optional(),
  customer_id: z.string().nullable().optional(),
  customer_name: z.string().nullable().optional()
});

export type CreateTransactionInput = z.infer<typeof createTransactionInputSchema>;

export const updateTransactionStatusInputSchema = z.object({
  transaction_id: z.string(),
  status: transactionStatusSchema,
  external_transaction_id: z.string().optional(),
  digiflazz_response: z.record(z.any()).optional()
});

export type UpdateTransactionStatusInput = z.infer<typeof updateTransactionStatusInputSchema>;

// Referral schema
export const referralSchema = z.object({
  id: z.number(),
  referrer_id: z.number(),
  referred_id: z.number(),
  commission_amount: z.number(),
  transaction_id: z.number(),
  is_paid: z.boolean(),
  created_at: z.coerce.date()
});

export type Referral = z.infer<typeof referralSchema>;

// Admin dashboard schemas
export const adminStatsSchema = z.object({
  total_users: z.number(),
  total_transactions: z.number(),
  total_revenue: z.number(),
  pending_transactions: z.number(),
  successful_transactions: z.number(),
  failed_transactions: z.number()
});

export type AdminStats = z.infer<typeof adminStatsSchema>;

// Query schemas
export const paginationInputSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20)
});

export type PaginationInput = z.infer<typeof paginationInputSchema>;

export const getTransactionsInputSchema = z.object({
  user_id: z.number().optional(),
  status: transactionStatusSchema.optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20)
});

export type GetTransactionsInput = z.infer<typeof getTransactionsInputSchema>;

export const getProductsInputSchema = z.object({
  category: productCategorySchema.optional(),
  is_active: z.boolean().optional(),
  search: z.string().optional()
});

export type GetProductsInput = z.infer<typeof getProductsInputSchema>;

// Auth response schema
export const authResponseSchema = z.object({
  user: userSchema.omit({ password_hash: true }),
  token: z.string()
});

export type AuthResponse = z.infer<typeof authResponseSchema>;

// Digiflazz API schemas
export const digiflazzServiceSchema = z.object({
  buyer_sku_code: z.string(),
  product_name: z.string(),
  category: z.string(),
  brand: z.string(),
  type: z.string(),
  seller_name: z.string(),
  price: z.number(),
  buyer_product_status: z.boolean(),
  seller_product_status: z.boolean(),
  unlimited_stock: z.boolean(),
  stock: z.number(),
  multi: z.boolean(),
  start_cut_off: z.string(),
  end_cut_off: z.string(),
  desc: z.string()
});

export type DigiflazzService = z.infer<typeof digiflazzServiceSchema>;

export const digiflazzOrderInputSchema = z.object({
  username: z.string(),
  buyer_sku_code: z.string(),
  customer_no: z.string(),
  ref_id: z.string(),
  sign: z.string()
});

export type DigiflazzOrderInput = z.infer<typeof digiflazzOrderInputSchema>;

export const digiflazzOrderResponseSchema = z.object({
  data: z.object({
    ref_id: z.string(),
    customer_no: z.string(),
    buyer_sku_code: z.string(),
    message: z.string(),
    status: z.string(),
    rc: z.string(),
    buyer_last_saldo: z.number(),
    price: z.number(),
    tele: z.string(),
    wa: z.string(),
    serial_number: z.string().optional()
  })
});

export type DigiflazzOrderResponse = z.infer<typeof digiflazzOrderResponseSchema>;