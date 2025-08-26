import { initTRPC, TRPCError } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import 'dotenv/config';
import cors from 'cors';
import superjson from 'superjson';
import { z } from 'zod';

// Import schemas
import {
  registerInputSchema,
  loginInputSchema,
  createTransactionInputSchema,
  updateTransactionStatusInputSchema,
  getTransactionsInputSchema,
  getProductsInputSchema,
  paginationInputSchema
} from './schema';

// Import handlers
import { register, login, verifyToken } from './handlers/auth';
import { getProducts, getProductById, getProductsByCategory } from './handlers/products';
import { 
  createTransaction, 
  updateTransactionStatus, 
  getTransactions, 
  getTransactionById,
  getUserTransactions 
} from './handlers/transactions';
import { getAdminStats, getAllTransactions, getAllUsers, getRevenueAnalytics } from './handlers/admin';
import { 
  processReferralCommission, 
  getUserReferralEarnings, 
  getUserReferrals, 
  validateReferralCode,
  markReferralAsPaid 
} from './handlers/referrals';
import { 
  getDigiflazzServices, 
  createDigiflazzOrder, 
  checkDigiflazzStatus, 
  syncProductsFromDigiflazz 
} from './handlers/digiflazz';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

// Auth middleware (placeholder - should validate JWT token)
const authenticatedProcedure = publicProcedure.use(async ({ next, ctx }) => {
  // This should validate JWT token from headers
  // For now, we'll just pass through
  return next({
    ctx: {
      ...ctx,
      user: { id: 1 } // Placeholder user
    }
  });
});

// Admin middleware (placeholder - should check admin role)
const adminProcedure = authenticatedProcedure.use(async ({ next, ctx }) => {
  // This should check if user has admin role
  // For now, we'll just pass through
  return next({ ctx });
});

const appRouter = router({
  // Health check
  healthcheck: publicProcedure.query(() => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }),

  // Authentication routes
  auth: router({
    register: publicProcedure
      .input(registerInputSchema)
      .mutation(({ input }) => register(input)),
    
    login: publicProcedure
      .input(loginInputSchema)
      .mutation(({ input }) => login(input)),
    
    verifyToken: authenticatedProcedure
      .query(({ ctx }) => verifyToken('placeholder-token')),
  }),

  // Product routes
  products: router({
    getAll: publicProcedure
      .input(getProductsInputSchema.optional())
      .query(({ input }) => getProducts(input)),
    
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getProductById(input.id)),
    
    getByCategory: publicProcedure
      .input(z.object({ category: z.string() }))
      .query(({ input }) => getProductsByCategory(input.category)),
  }),

  // Transaction routes
  transactions: router({
    create: authenticatedProcedure
      .input(createTransactionInputSchema)
      .mutation(({ input }) => createTransaction(input)),
    
    updateStatus: publicProcedure // Should be webhook endpoint
      .input(updateTransactionStatusInputSchema)
      .mutation(({ input }) => updateTransactionStatus(input)),
    
    getAll: adminProcedure
      .input(getTransactionsInputSchema.optional())
      .query(({ input }) => getTransactions(input || { page: 1, limit: 20 })),
    
    getById: authenticatedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getTransactionById(input.id)),
    
    getUserTransactions: authenticatedProcedure
      .input(z.object({ 
        userId: z.number(),
        page: z.number().default(1),
        limit: z.number().default(20)
      }))
      .query(({ input }) => getUserTransactions(input.userId, input.page, input.limit)),
  }),

  // Admin routes
  admin: router({
    getStats: adminProcedure
      .query(() => getAdminStats()),
    
    getAllTransactions: adminProcedure
      .input(paginationInputSchema.optional())
      .query(({ input }) => getAllTransactions(input?.page, input?.limit)),
    
    getAllUsers: adminProcedure
      .input(paginationInputSchema.optional())
      .query(({ input }) => getAllUsers(input?.page, input?.limit)),
    
    getRevenueAnalytics: adminProcedure
      .input(z.object({
        period: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
        days: z.number().default(30)
      }))
      .query(({ input }) => getRevenueAnalytics(input.period, input.days)),
  }),

  // Referral routes
  referrals: router({
    processCommission: publicProcedure // Should be internal call
      .input(z.object({ transactionId: z.number() }))
      .mutation(({ input }) => processReferralCommission(input.transactionId)),
    
    getUserEarnings: authenticatedProcedure
      .input(z.object({ userId: z.number() }))
      .query(({ input }) => getUserReferralEarnings(input.userId)),
    
    getUserReferrals: authenticatedProcedure
      .input(z.object({ userId: z.number() }))
      .query(({ input }) => getUserReferrals(input.userId)),
    
    validateCode: publicProcedure
      .input(z.object({ referralCode: z.string() }))
      .query(({ input }) => validateReferralCode(input.referralCode)),
    
    markAsPaid: adminProcedure
      .input(z.object({ referralId: z.number() }))
      .mutation(({ input }) => markReferralAsPaid(input.referralId)),
  }),

  // Digiflazz integration routes
  digiflazz: router({
    getServices: adminProcedure
      .query(() => getDigiflazzServices()),
    
    createOrder: publicProcedure // Should be internal call
      .input(z.object({
        username: z.string(),
        buyer_sku_code: z.string(),
        customer_no: z.string(),
        ref_id: z.string(),
        sign: z.string()
      }))
      .mutation(({ input }) => createDigiflazzOrder(input)),
    
    checkStatus: adminProcedure
      .input(z.object({ refId: z.string() }))
      .query(({ input }) => checkDigiflazzStatus(input.refId)),
    
    syncProducts: adminProcedure
      .mutation(() => syncProductsFromDigiflazz()),
  }),
});

export type AppRouter = typeof appRouter;

async function start() {
  const port = process.env['SERVER_PORT'] || 2022;
  const server = createHTTPServer({
    middleware: (req, res, next) => {
      cors()(req, res, next);
    },
    router: appRouter,
    createContext() {
      return {};
    },
  });
  
  server.listen(port);
  console.log(`🚀 Digital Top-up TRPC server listening at port: ${port}`);
  console.log(`📱 Ready to handle digital product transactions!`);
}

start().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});