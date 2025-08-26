import { db } from '../db';
import { transactionsTable, usersTable, productsTable, referralsTable } from '../db/schema';
import { 
    type Transaction, 
    type CreateTransactionInput, 
    type UpdateTransactionStatusInput,
    type GetTransactionsInput 
} from '../schema';
import { eq, and, count, desc, SQL } from 'drizzle-orm';

// Generate unique transaction ID
function generateTransactionId(): string {
  return `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Calculate referral commission (5% of transaction amount)
function calculateCommission(amount: number): number {
  return Math.round(amount * 0.05);
}

// Helper function to convert DB transaction to API transaction
function convertDbTransaction(dbTransaction: any): Transaction {
  return {
    ...dbTransaction,
    amount: parseFloat(dbTransaction.amount),
    price: parseFloat(dbTransaction.price),
    digiflazz_response: dbTransaction.digiflazz_response as Record<string, any> | null
  };
}

// Create a new transaction
export async function createTransaction(input: CreateTransactionInput): Promise<Transaction> {
  try {
    // 1. Validate user exists
    const userExists = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, input.user_id))
      .limit(1)
      .execute();

    if (userExists.length === 0) {
      throw new Error('User not found');
    }

    // 2. Validate product exists
    const product = await db.select()
      .from(productsTable)
      .where(eq(productsTable.id, input.product_id))
      .limit(1)
      .execute();

    if (product.length === 0) {
      throw new Error('Product not found');
    }

    if (!product[0].is_active) {
      throw new Error('Product is not active');
    }

    // 3. Calculate amount and price
    let finalAmount = input.amount || parseFloat(product[0].price);
    const finalPrice = parseFloat(product[0].price);

    // For range denomination type, validate amount is within bounds
    if (product[0].denomination_type === 'range') {
      if (product[0].min_amount && finalAmount < parseFloat(product[0].min_amount)) {
        throw new Error(`Amount must be at least ${product[0].min_amount}`);
      }
      if (product[0].max_amount && finalAmount > parseFloat(product[0].max_amount)) {
        throw new Error(`Amount must not exceed ${product[0].max_amount}`);
      }
    }

    // 4. Generate unique transaction ID
    const transactionId = generateTransactionId();

    // 5. Create transaction record
    const result = await db.insert(transactionsTable)
      .values({
        user_id: input.user_id,
        product_id: input.product_id,
        transaction_id: transactionId,
        amount: finalAmount.toString(),
        price: finalPrice.toString(),
        status: 'pending',
        customer_phone: input.customer_phone || null,
        customer_id: input.customer_id || null,
        customer_name: input.customer_name || null
      })
      .returning()
      .execute();

    // Convert and return transaction
    return convertDbTransaction(result[0]);
  } catch (error) {
    console.error('Transaction creation failed:', error);
    throw error;
  }
}

// Update transaction status (used for webhook/callback)
export async function updateTransactionStatus(input: UpdateTransactionStatusInput): Promise<Transaction | null> {
  try {
    // 1. Find and update transaction
    const result = await db.update(transactionsTable)
      .set({
        status: input.status,
        external_transaction_id: input.external_transaction_id || null,
        digiflazz_response: (input.digiflazz_response as Record<string, any>) || null,
        updated_at: new Date()
      })
      .where(eq(transactionsTable.transaction_id, input.transaction_id))
      .returning()
      .execute();

    if (result.length === 0) {
      return null;
    }

    const transaction = result[0];

    // 2. Handle referral commission if transaction successful
    if (input.status === 'success') {
      await processReferralCommission(transaction.id, transaction.user_id, parseFloat(transaction.amount));
    }

    return convertDbTransaction(transaction);
  } catch (error) {
    console.error('Transaction status update failed:', error);
    throw error;
  }
}

// Process referral commission for successful transactions
async function processReferralCommission(transactionId: number, userId: number, amount: number): Promise<void> {
  try {
    // Find user's referrer
    const user = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1)
      .execute();

    if (user.length > 0 && user[0].referred_by_id) {
      const commissionAmount = calculateCommission(amount);

      // Create referral commission record
      await db.insert(referralsTable)
        .values({
          referrer_id: user[0].referred_by_id,
          referred_id: userId,
          commission_amount: commissionAmount.toString(),
          transaction_id: transactionId
        })
        .execute();
    }
  } catch (error) {
    console.error('Referral commission processing failed:', error);
    // Don't throw error - this shouldn't fail the transaction update
  }
}

// Get transactions with optional filtering and pagination
export async function getTransactions(input: GetTransactionsInput): Promise<{ 
  transactions: Transaction[], 
  total: number, 
  page: number, 
  limit: number 
}> {
  try {
    // Build conditions array
    const conditions: SQL<unknown>[] = [];

    if (input.user_id !== undefined) {
      conditions.push(eq(transactionsTable.user_id, input.user_id));
    }

    if (input.status) {
      conditions.push(eq(transactionsTable.status, input.status));
    }

    // Apply ordering and pagination
    const offset = (input.page - 1) * input.limit;

    // Execute query with or without conditions
    const results = conditions.length > 0
      ? await db.select()
          .from(transactionsTable)
          .where(conditions.length === 1 ? conditions[0] : and(...conditions))
          .orderBy(desc(transactionsTable.created_at))
          .limit(input.limit)
          .offset(offset)
          .execute()
      : await db.select()
          .from(transactionsTable)
          .orderBy(desc(transactionsTable.created_at))
          .limit(input.limit)
          .offset(offset)
          .execute();

    // Get total count for pagination
    const totalResult = conditions.length > 0
      ? await db.select({ count: count() })
          .from(transactionsTable)
          .where(conditions.length === 1 ? conditions[0] : and(...conditions))
          .execute()
      : await db.select({ count: count() })
          .from(transactionsTable)
          .execute();

    const total = totalResult[0].count;

    // Convert numeric fields
    const transactions = results.map(convertDbTransaction);

    return {
      transactions,
      total,
      page: input.page,
      limit: input.limit
    };
  } catch (error) {
    console.error('Get transactions failed:', error);
    throw error;
  }
}

// Get transaction by ID
export async function getTransactionById(id: number): Promise<Transaction | null> {
  try {
    const result = await db.select()
      .from(transactionsTable)
      .where(eq(transactionsTable.id, id))
      .limit(1)
      .execute();

    if (result.length === 0) {
      return null;
    }

    return convertDbTransaction(result[0]);
  } catch (error) {
    console.error('Get transaction by ID failed:', error);
    throw error;
  }
}

// Get user's transaction history
export async function getUserTransactions(userId: number, page: number = 1, limit: number = 20): Promise<{
  transactions: Transaction[],
  total: number,
  page: number,
  limit: number
}> {
  try {
    const offset = (page - 1) * limit;

    // Get user transactions ordered by newest first
    const results = await db.select()
      .from(transactionsTable)
      .where(eq(transactionsTable.user_id, userId))
      .orderBy(desc(transactionsTable.created_at))
      .limit(limit)
      .offset(offset)
      .execute();

    // Get total count
    const totalResult = await db.select({ count: count() })
      .from(transactionsTable)
      .where(eq(transactionsTable.user_id, userId))
      .execute();

    const total = totalResult[0].count;

    // Convert numeric fields
    const transactions = results.map(convertDbTransaction);

    return {
      transactions,
      total,
      page,
      limit
    };
  } catch (error) {
    console.error('Get user transactions failed:', error);
    throw error;
  }
}