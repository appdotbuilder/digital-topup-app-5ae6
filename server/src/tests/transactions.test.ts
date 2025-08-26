import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, productsTable, transactionsTable, referralsTable } from '../db/schema';
import { 
  createTransaction, 
  updateTransactionStatus, 
  getTransactions, 
  getTransactionById, 
  getUserTransactions 
} from '../handlers/transactions';
import { 
  type CreateTransactionInput, 
  type UpdateTransactionStatusInput,
  type GetTransactionsInput 
} from '../schema';
import { eq, count } from 'drizzle-orm';

describe('Transaction Handlers', () => {
  let testUserId: number;
  let testProductId: number;
  let referrerUserId: number;

  beforeEach(async () => {
    await createDB();

    // Create test users
    const users = await db.insert(usersTable)
      .values([
        {
          email: 'referrer@test.com',
          password_hash: 'hashed_password',
          full_name: 'Referrer User',
          phone_number: '081234567890',
          referral_code: 'REF001'
        },
        {
          email: 'user@test.com',
          password_hash: 'hashed_password',
          full_name: 'Test User',
          phone_number: '081234567891',
          referral_code: 'REF002',
          referred_by_id: null // Will be set after referrer is created
        }
      ])
      .returning()
      .execute();

    referrerUserId = users[0].id;
    
    // Update second user to be referred by first user
    const referredUser = await db.update(usersTable)
      .set({ referred_by_id: referrerUserId })
      .where(eq(usersTable.email, 'user@test.com'))
      .returning()
      .execute();

    testUserId = referredUser[0].id;

    // Create test products
    const products = await db.insert(productsTable)
      .values([
        {
          sku: 'MOBILE_001',
          name: 'Mobile Credit 5K',
          description: 'Mobile credit 5000',
          category: 'mobile_credit',
          price: '5500.00',
          base_price: '5000.00',
          provider: 'Digiflazz',
          is_active: true,
          denomination_type: 'fixed'
        },
        {
          sku: 'DATA_RANGE',
          name: 'Data Package Range',
          description: 'Data package with range',
          category: 'data_package',
          price: '10000.00',
          base_price: '9500.00',
          provider: 'Digiflazz',
          is_active: true,
          denomination_type: 'range',
          min_amount: '5000.00',
          max_amount: '50000.00'
        },
        {
          sku: 'INACTIVE_PROD',
          name: 'Inactive Product',
          description: 'Inactive product',
          category: 'other',
          price: '1000.00',
          base_price: '900.00',
          provider: 'Digiflazz',
          is_active: false,
          denomination_type: 'fixed'
        }
      ])
      .returning()
      .execute();

    testProductId = products[0].id;
  });

  afterEach(resetDB);

  describe('createTransaction', () => {
    it('should create a transaction successfully', async () => {
      const input: CreateTransactionInput = {
        user_id: testUserId,
        product_id: testProductId,
        customer_phone: '081234567890',
        customer_name: 'John Doe'
      };

      const result = await createTransaction(input);

      expect(result.user_id).toBe(testUserId);
      expect(result.product_id).toBe(testProductId);
      expect(result.amount).toBe(5500); // Uses product price as default amount
      expect(result.price).toBe(5500);
      expect(result.status).toBe('pending');
      expect(result.customer_phone).toBe('081234567890');
      expect(result.customer_name).toBe('John Doe');
      expect(result.transaction_id).toMatch(/^TXN_/);
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
    });

    it('should create transaction with custom amount for range products', async () => {
      const rangeProduct = await db.select()
        .from(productsTable)
        .where(eq(productsTable.sku, 'DATA_RANGE'))
        .limit(1)
        .execute();

      const input: CreateTransactionInput = {
        user_id: testUserId,
        product_id: rangeProduct[0].id,
        amount: 25000,
        customer_phone: '081234567890'
      };

      const result = await createTransaction(input);

      expect(result.amount).toBe(25000);
      expect(result.price).toBe(10000);
      expect(result.status).toBe('pending');
    });

    it('should save transaction to database', async () => {
      const input: CreateTransactionInput = {
        user_id: testUserId,
        product_id: testProductId,
        customer_phone: '081234567890'
      };

      const result = await createTransaction(input);

      const dbTransaction = await db.select()
        .from(transactionsTable)
        .where(eq(transactionsTable.id, result.id))
        .limit(1)
        .execute();

      expect(dbTransaction).toHaveLength(1);
      expect(dbTransaction[0].transaction_id).toBe(result.transaction_id);
      expect(parseFloat(dbTransaction[0].amount)).toBe(5500);
      expect(parseFloat(dbTransaction[0].price)).toBe(5500);
    });

    it('should throw error for non-existent user', async () => {
      const input: CreateTransactionInput = {
        user_id: 99999,
        product_id: testProductId
      };

      await expect(createTransaction(input)).rejects.toThrow(/User not found/i);
    });

    it('should throw error for non-existent product', async () => {
      const input: CreateTransactionInput = {
        user_id: testUserId,
        product_id: 99999
      };

      await expect(createTransaction(input)).rejects.toThrow(/Product not found/i);
    });

    it('should throw error for inactive product', async () => {
      const inactiveProduct = await db.select()
        .from(productsTable)
        .where(eq(productsTable.sku, 'INACTIVE_PROD'))
        .limit(1)
        .execute();

      const input: CreateTransactionInput = {
        user_id: testUserId,
        product_id: inactiveProduct[0].id
      };

      await expect(createTransaction(input)).rejects.toThrow(/Product is not active/i);
    });

    it('should validate amount bounds for range products', async () => {
      const rangeProduct = await db.select()
        .from(productsTable)
        .where(eq(productsTable.sku, 'DATA_RANGE'))
        .limit(1)
        .execute();

      // Test minimum bound
      const inputTooLow: CreateTransactionInput = {
        user_id: testUserId,
        product_id: rangeProduct[0].id,
        amount: 1000
      };

      await expect(createTransaction(inputTooLow)).rejects.toThrow(/Amount must be at least/i);

      // Test maximum bound
      const inputTooHigh: CreateTransactionInput = {
        user_id: testUserId,
        product_id: rangeProduct[0].id,
        amount: 100000
      };

      await expect(createTransaction(inputTooHigh)).rejects.toThrow(/Amount must not exceed/i);
    });
  });

  describe('updateTransactionStatus', () => {
    let testTransaction: any;

    beforeEach(async () => {
      const input: CreateTransactionInput = {
        user_id: testUserId,
        product_id: testProductId,
        customer_phone: '081234567890'
      };
      testTransaction = await createTransaction(input);
    });

    it('should update transaction status successfully', async () => {
      const updateInput: UpdateTransactionStatusInput = {
        transaction_id: testTransaction.transaction_id,
        status: 'success',
        external_transaction_id: 'EXT_123456',
        digiflazz_response: { status: 'success', message: 'Transaction completed' }
      };

      const result = await updateTransactionStatus(updateInput);

      expect(result).not.toBeNull();
      expect(result!.status).toBe('success');
      expect(result!.external_transaction_id).toBe('EXT_123456');
      expect(result!.digiflazz_response).toEqual({ status: 'success', message: 'Transaction completed' });
    });

    it('should create referral commission for successful transaction', async () => {
      const updateInput: UpdateTransactionStatusInput = {
        transaction_id: testTransaction.transaction_id,
        status: 'success'
      };

      await updateTransactionStatus(updateInput);

      // Check if referral record was created
      const referrals = await db.select()
        .from(referralsTable)
        .where(eq(referralsTable.transaction_id, testTransaction.id))
        .execute();

      expect(referrals).toHaveLength(1);
      expect(referrals[0].referrer_id).toBe(referrerUserId);
      expect(referrals[0].referred_id).toBe(testUserId);
      expect(parseFloat(referrals[0].commission_amount)).toBe(275); // 5% of 5500
      expect(referrals[0].is_paid).toBe(false);
    });

    it('should return null for non-existent transaction', async () => {
      const updateInput: UpdateTransactionStatusInput = {
        transaction_id: 'NON_EXISTENT',
        status: 'failed'
      };

      const result = await updateTransactionStatus(updateInput);
      expect(result).toBeNull();
    });

    it('should update failed status without creating referral', async () => {
      const updateInput: UpdateTransactionStatusInput = {
        transaction_id: testTransaction.transaction_id,
        status: 'failed'
      };

      const result = await updateTransactionStatus(updateInput);

      expect(result!.status).toBe('failed');

      // Check no referral record was created
      const referrals = await db.select()
        .from(referralsTable)
        .where(eq(referralsTable.transaction_id, testTransaction.id))
        .execute();

      expect(referrals).toHaveLength(0);
    });
  });

  describe('getTransactions', () => {
    beforeEach(async () => {
      // Create test transactions with different statuses
      const transactions = [
        {
          user_id: testUserId,
          product_id: testProductId,
          transaction_id: 'TXN_001',
          amount: '5500.00',
          price: '5500.00',
          status: 'success' as const,
          customer_phone: '081234567890'
        },
        {
          user_id: testUserId,
          product_id: testProductId,
          transaction_id: 'TXN_002',
          amount: '10000.00',
          price: '10000.00',
          status: 'pending' as const,
          customer_phone: '081234567891'
        },
        {
          user_id: referrerUserId,
          product_id: testProductId,
          transaction_id: 'TXN_003',
          amount: '7500.00',
          price: '7500.00',
          status: 'failed' as const,
          customer_phone: '081234567892'
        }
      ];

      await db.insert(transactionsTable).values(transactions).execute();
    });

    it('should get all transactions with pagination', async () => {
      const input: GetTransactionsInput = {
        page: 1,
        limit: 10
      };

      const result = await getTransactions(input);

      expect(result.transactions).toHaveLength(3);
      expect(result.total).toBe(3);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(typeof result.transactions[0].amount).toBe('number');
      expect(typeof result.transactions[0].price).toBe('number');
    });

    it('should filter transactions by user_id', async () => {
      const input: GetTransactionsInput = {
        user_id: testUserId,
        page: 1,
        limit: 10
      };

      const result = await getTransactions(input);

      expect(result.transactions).toHaveLength(2);
      expect(result.total).toBe(2);
      result.transactions.forEach(tx => {
        expect(tx.user_id).toBe(testUserId);
      });
    });

    it('should filter transactions by status', async () => {
      const input: GetTransactionsInput = {
        status: 'success',
        page: 1,
        limit: 10
      };

      const result = await getTransactions(input);

      expect(result.transactions).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.transactions[0].status).toBe('success');
    });

    it('should filter by both user_id and status', async () => {
      const input: GetTransactionsInput = {
        user_id: testUserId,
        status: 'pending',
        page: 1,
        limit: 10
      };

      const result = await getTransactions(input);

      expect(result.transactions).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.transactions[0].status).toBe('pending');
      expect(result.transactions[0].user_id).toBe(testUserId);
    });

    it('should implement pagination correctly', async () => {
      const page1Input: GetTransactionsInput = {
        page: 1,
        limit: 2
      };

      const page1Result = await getTransactions(page1Input);

      expect(page1Result.transactions).toHaveLength(2);
      expect(page1Result.total).toBe(3);
      expect(page1Result.page).toBe(1);

      const page2Input: GetTransactionsInput = {
        page: 2,
        limit: 2
      };

      const page2Result = await getTransactions(page2Input);

      expect(page2Result.transactions).toHaveLength(1);
      expect(page2Result.total).toBe(3);
      expect(page2Result.page).toBe(2);
    });

    it('should order transactions by created_at DESC', async () => {
      const input: GetTransactionsInput = {
        page: 1,
        limit: 10
      };

      const result = await getTransactions(input);

      // Check that transactions are ordered by newest first
      for (let i = 1; i < result.transactions.length; i++) {
        expect(result.transactions[i-1].created_at.getTime())
          .toBeGreaterThanOrEqual(result.transactions[i].created_at.getTime());
      }
    });
  });

  describe('getTransactionById', () => {
    let testTransaction: any;

    beforeEach(async () => {
      const input: CreateTransactionInput = {
        user_id: testUserId,
        product_id: testProductId,
        customer_phone: '081234567890'
      };
      testTransaction = await createTransaction(input);
    });

    it('should get transaction by ID', async () => {
      const result = await getTransactionById(testTransaction.id);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(testTransaction.id);
      expect(result!.user_id).toBe(testUserId);
      expect(result!.product_id).toBe(testProductId);
      expect(typeof result!.amount).toBe('number');
      expect(typeof result!.price).toBe('number');
    });

    it('should return null for non-existent transaction', async () => {
      const result = await getTransactionById(99999);
      expect(result).toBeNull();
    });
  });

  describe('getUserTransactions', () => {
    beforeEach(async () => {
      // Create multiple transactions for test user
      const transactions = [
        {
          user_id: testUserId,
          product_id: testProductId,
          transaction_id: 'USER_TXN_001',
          amount: '5500.00',
          price: '5500.00',
          status: 'success' as const
        },
        {
          user_id: testUserId,
          product_id: testProductId,
          transaction_id: 'USER_TXN_002',
          amount: '10000.00',
          price: '10000.00',
          status: 'pending' as const
        },
        {
          user_id: referrerUserId,
          product_id: testProductId,
          transaction_id: 'OTHER_TXN_001',
          amount: '7500.00',
          price: '7500.00',
          status: 'success' as const
        }
      ];

      await db.insert(transactionsTable).values(transactions).execute();
    });

    it('should get user transactions with default pagination', async () => {
      const result = await getUserTransactions(testUserId);

      expect(result.transactions).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      result.transactions.forEach(tx => {
        expect(tx.user_id).toBe(testUserId);
        expect(typeof tx.amount).toBe('number');
        expect(typeof tx.price).toBe('number');
      });
    });

    it('should implement pagination for user transactions', async () => {
      const result = await getUserTransactions(testUserId, 1, 1);

      expect(result.transactions).toHaveLength(1);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(1);
    });

    it('should return empty array for user with no transactions', async () => {
      // Create a new user with no transactions
      const newUser = await db.insert(usersTable)
        .values({
          email: 'noTransactions@test.com',
          password_hash: 'hashed_password',
          full_name: 'No Transactions User',
          referral_code: 'REF999'
        })
        .returning()
        .execute();

      const result = await getUserTransactions(newUser[0].id);

      expect(result.transactions).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should order user transactions by created_at DESC', async () => {
      const result = await getUserTransactions(testUserId);

      // Check that transactions are ordered by newest first
      for (let i = 1; i < result.transactions.length; i++) {
        expect(result.transactions[i-1].created_at.getTime())
          .toBeGreaterThanOrEqual(result.transactions[i].created_at.getTime());
      }
    });
  });
});