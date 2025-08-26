import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, transactionsTable, productsTable } from '../db/schema';
import { 
  getAdminStats, 
  getAllTransactions, 
  getAllUsers, 
  getRevenueAnalytics 
} from '../handlers/admin';

describe('Admin Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('getAdminStats', () => {
    it('should return admin statistics with zero counts for empty database', async () => {
      const stats = await getAdminStats();

      expect(stats.total_users).toEqual(0);
      expect(stats.total_transactions).toEqual(0);
      expect(stats.total_revenue).toEqual(0);
      expect(stats.pending_transactions).toEqual(0);
      expect(stats.successful_transactions).toEqual(0);
      expect(stats.failed_transactions).toEqual(0);
    });

    it('should calculate correct statistics with sample data', async () => {
      // Create test users
      const usersResult = await db.insert(usersTable).values([
        {
          email: 'user1@example.com',
          password_hash: 'hash1',
          full_name: 'User One',
          phone_number: '081234567890',
          referral_code: 'REF001',
          referred_by_id: null
        },
        {
          email: 'user2@example.com',
          password_hash: 'hash2',
          full_name: 'User Two',
          phone_number: '081234567891',
          referral_code: 'REF002',
          referred_by_id: null
        }
      ]).returning().execute();

      // Create test product
      const productResult = await db.insert(productsTable).values({
        sku: 'TEST_PRODUCT_001',
        name: 'Test Product',
        description: 'A test product',
        category: 'mobile_credit',
        price: '10000.00',
        base_price: '9500.00',
        provider: 'TestProvider',
        is_active: true,
        denomination_type: 'fixed'
      }).returning().execute();

      // Create test transactions with different statuses
      await db.insert(transactionsTable).values([
        {
          user_id: usersResult[0].id,
          product_id: productResult[0].id,
          transaction_id: 'TXN_001',
          external_transaction_id: 'EXT_001',
          amount: '10000.00',
          price: '10500.00',
          status: 'success',
          customer_phone: '081234567890',
          customer_id: null,
          customer_name: 'Customer One',
          notes: null,
          digiflazz_response: null
        },
        {
          user_id: usersResult[0].id,
          product_id: productResult[0].id,
          transaction_id: 'TXN_002',
          external_transaction_id: 'EXT_002',
          amount: '15000.00',
          price: '15500.00',
          status: 'success',
          customer_phone: '081234567891',
          customer_id: null,
          customer_name: 'Customer Two',
          notes: null,
          digiflazz_response: null
        },
        {
          user_id: usersResult[1].id,
          product_id: productResult[0].id,
          transaction_id: 'TXN_003',
          external_transaction_id: 'EXT_003',
          amount: '20000.00',
          price: '20500.00',
          status: 'pending',
          customer_phone: '081234567892',
          customer_id: null,
          customer_name: 'Customer Three',
          notes: null,
          digiflazz_response: null
        },
        {
          user_id: usersResult[1].id,
          product_id: productResult[0].id,
          transaction_id: 'TXN_004',
          external_transaction_id: 'EXT_004',
          amount: '5000.00',
          price: '5500.00',
          status: 'failed',
          customer_phone: '081234567893',
          customer_id: null,
          customer_name: 'Customer Four',
          notes: null,
          digiflazz_response: null
        }
      ]).execute();

      const stats = await getAdminStats();

      expect(stats.total_users).toEqual(2);
      expect(stats.total_transactions).toEqual(4);
      expect(stats.total_revenue).toEqual(26000); // 10500 + 15500
      expect(stats.pending_transactions).toEqual(1);
      expect(stats.successful_transactions).toEqual(2);
      expect(stats.failed_transactions).toEqual(1);
    });

    it('should handle processing status as pending', async () => {
      // Create test user and product
      const userResult = await db.insert(usersTable).values({
        email: 'user@example.com',
        password_hash: 'hash',
        full_name: 'Test User',
        phone_number: '081234567890',
        referral_code: 'REF001',
        referred_by_id: null
      }).returning().execute();

      const productResult = await db.insert(productsTable).values({
        sku: 'TEST_PRODUCT_001',
        name: 'Test Product',
        description: 'A test product',
        category: 'mobile_credit',
        price: '10000.00',
        base_price: '9500.00',
        provider: 'TestProvider',
        is_active: true,
        denomination_type: 'fixed'
      }).returning().execute();

      // Create transaction with processing status
      await db.insert(transactionsTable).values({
        user_id: userResult[0].id,
        product_id: productResult[0].id,
        transaction_id: 'TXN_001',
        external_transaction_id: 'EXT_001',
        amount: '10000.00',
        price: '10500.00',
        status: 'processing',
        customer_phone: '081234567890',
        customer_id: null,
        customer_name: 'Customer One',
        notes: null,
        digiflazz_response: null
      }).execute();

      const stats = await getAdminStats();

      expect(stats.pending_transactions).toEqual(1);
      expect(stats.successful_transactions).toEqual(0);
      expect(stats.failed_transactions).toEqual(0);
    });
  });

  describe('getAllTransactions', () => {
    it('should return empty result for no transactions', async () => {
      const result = await getAllTransactions(1, 10);

      expect(result.transactions).toHaveLength(0);
      expect(result.total).toEqual(0);
      expect(result.page).toEqual(1);
      expect(result.limit).toEqual(10);
    });

    it('should return paginated transactions ordered by created_at desc', async () => {
      // Create test user and product
      const userResult = await db.insert(usersTable).values({
        email: 'user@example.com',
        password_hash: 'hash',
        full_name: 'Test User',
        phone_number: '081234567890',
        referral_code: 'REF001',
        referred_by_id: null
      }).returning().execute();

      const productResult = await db.insert(productsTable).values({
        sku: 'TEST_PRODUCT_001',
        name: 'Test Product',
        description: 'A test product',
        category: 'mobile_credit',
        price: '10000.00',
        base_price: '9500.00',
        provider: 'TestProvider',
        is_active: true,
        denomination_type: 'fixed'
      }).returning().execute();

      // Create multiple transactions
      const transactions = [];
      for (let i = 1; i <= 5; i++) {
        const transaction = await db.insert(transactionsTable).values({
          user_id: userResult[0].id,
          product_id: productResult[0].id,
          transaction_id: `TXN_00${i}`,
          external_transaction_id: `EXT_00${i}`,
          amount: `${i * 1000}.00`,
          price: `${(i * 1000) + 500}.00`,
          status: 'success',
          customer_phone: '081234567890',
          customer_id: null,
          customer_name: `Customer ${i}`,
          notes: null,
          digiflazz_response: null
        }).returning().execute();
        transactions.push(transaction[0]);
      }

      const result = await getAllTransactions(1, 3);

      expect(result.transactions).toHaveLength(3);
      expect(result.total).toEqual(5);
      expect(result.page).toEqual(1);
      expect(result.limit).toEqual(3);

      // Check ordering (newest first)
      expect(result.transactions[0].created_at >= result.transactions[1].created_at).toBe(true);
      expect(result.transactions[1].created_at >= result.transactions[2].created_at).toBe(true);

      // Check numeric conversion
      expect(typeof result.transactions[0].amount).toBe('number');
      expect(typeof result.transactions[0].price).toBe('number');
    });

    it('should handle pagination correctly', async () => {
      // Create test user and product
      const userResult = await db.insert(usersTable).values({
        email: 'user@example.com',
        password_hash: 'hash',
        full_name: 'Test User',
        phone_number: '081234567890',
        referral_code: 'REF001',
        referred_by_id: null
      }).returning().execute();

      const productResult = await db.insert(productsTable).values({
        sku: 'TEST_PRODUCT_001',
        name: 'Test Product',
        description: 'A test product',
        category: 'mobile_credit',
        price: '10000.00',
        base_price: '9500.00',
        provider: 'TestProvider',
        is_active: true,
        denomination_type: 'fixed'
      }).returning().execute();

      // Create 5 transactions
      for (let i = 1; i <= 5; i++) {
        await db.insert(transactionsTable).values({
          user_id: userResult[0].id,
          product_id: productResult[0].id,
          transaction_id: `TXN_00${i}`,
          external_transaction_id: `EXT_00${i}`,
          amount: `${i * 1000}.00`,
          price: `${(i * 1000) + 500}.00`,
          status: 'success',
          customer_phone: '081234567890',
          customer_id: null,
          customer_name: `Customer ${i}`,
          notes: null,
          digiflazz_response: null
        }).execute();
      }

      // Test first page
      const page1 = await getAllTransactions(1, 2);
      expect(page1.transactions).toHaveLength(2);
      expect(page1.total).toEqual(5);

      // Test second page
      const page2 = await getAllTransactions(2, 2);
      expect(page2.transactions).toHaveLength(2);
      expect(page2.total).toEqual(5);

      // Test third page
      const page3 = await getAllTransactions(3, 2);
      expect(page3.transactions).toHaveLength(1);
      expect(page3.total).toEqual(5);
    });
  });

  describe('getAllUsers', () => {
    it('should return empty result for no users', async () => {
      const result = await getAllUsers(1, 10);

      expect(result.users).toHaveLength(0);
      expect(result.total).toEqual(0);
      expect(result.page).toEqual(1);
      expect(result.limit).toEqual(10);
    });

    it('should return paginated users ordered by created_at desc', async () => {
      // Create multiple users
      for (let i = 1; i <= 3; i++) {
        await db.insert(usersTable).values({
          email: `user${i}@example.com`,
          password_hash: `hash${i}`,
          full_name: `User ${i}`,
          phone_number: `08123456789${i}`,
          referral_code: `REF00${i}`,
          referred_by_id: null
        }).execute();
      }

      const result = await getAllUsers(1, 2);

      expect(result.users).toHaveLength(2);
      expect(result.total).toEqual(3);
      expect(result.page).toEqual(1);
      expect(result.limit).toEqual(2);

      // Check ordering (newest first)
      expect(result.users[0].created_at >= result.users[1].created_at).toBe(true);

      // Check password_hash is excluded (empty string for type compatibility)
      expect(result.users[0].password_hash).toEqual('');
      expect(result.users[1].password_hash).toEqual('');

      // Check other fields are present
      expect(result.users[0].email).toBeDefined();
      expect(result.users[0].full_name).toBeDefined();
      expect(result.users[0].referral_code).toBeDefined();
    });

    it('should handle pagination correctly', async () => {
      // Create 5 users
      for (let i = 1; i <= 5; i++) {
        await db.insert(usersTable).values({
          email: `user${i}@example.com`,
          password_hash: `hash${i}`,
          full_name: `User ${i}`,
          phone_number: `08123456789${i}`,
          referral_code: `REF00${i}`,
          referred_by_id: null
        }).execute();
      }

      // Test first page
      const page1 = await getAllUsers(1, 2);
      expect(page1.users).toHaveLength(2);
      expect(page1.total).toEqual(5);

      // Test second page
      const page2 = await getAllUsers(2, 2);
      expect(page2.users).toHaveLength(2);
      expect(page2.total).toEqual(5);

      // Test third page
      const page3 = await getAllUsers(3, 2);
      expect(page3.users).toHaveLength(1);
      expect(page3.total).toEqual(5);
    });
  });

  describe('getRevenueAnalytics', () => {
    it('should return empty analytics for no successful transactions', async () => {
      const result = await getRevenueAnalytics('daily', 7);

      expect(result.revenue_data).toHaveLength(0);
      expect(result.total_revenue).toEqual(0);
      expect(result.total_transactions).toEqual(0);
    });

    it('should calculate daily revenue analytics correctly', async () => {
      // Create test user and product
      const userResult = await db.insert(usersTable).values({
        email: 'user@example.com',
        password_hash: 'hash',
        full_name: 'Test User',
        phone_number: '081234567890',
        referral_code: 'REF001',
        referred_by_id: null
      }).returning().execute();

      const productResult = await db.insert(productsTable).values({
        sku: 'TEST_PRODUCT_001',
        name: 'Test Product',
        description: 'A test product',
        category: 'mobile_credit',
        price: '10000.00',
        base_price: '9500.00',
        provider: 'TestProvider',
        is_active: true,
        denomination_type: 'fixed'
      }).returning().execute();

      // Create successful transactions on specific dates
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      await db.insert(transactionsTable).values([
        {
          user_id: userResult[0].id,
          product_id: productResult[0].id,
          transaction_id: 'TXN_001',
          external_transaction_id: 'EXT_001',
          amount: '10000.00',
          price: '10500.00',
          status: 'success',
          customer_phone: '081234567890',
          customer_id: null,
          customer_name: 'Customer One',
          notes: null,
          digiflazz_response: null,
          created_at: today,
          updated_at: today
        },
        {
          user_id: userResult[0].id,
          product_id: productResult[0].id,
          transaction_id: 'TXN_002',
          external_transaction_id: 'EXT_002',
          amount: '15000.00',
          price: '15500.00',
          status: 'success',
          customer_phone: '081234567891',
          customer_id: null,
          customer_name: 'Customer Two',
          notes: null,
          digiflazz_response: null,
          created_at: today,
          updated_at: today
        },
        {
          user_id: userResult[0].id,
          product_id: productResult[0].id,
          transaction_id: 'TXN_003',
          external_transaction_id: 'EXT_003',
          amount: '20000.00',
          price: '20500.00',
          status: 'success',
          customer_phone: '081234567892',
          customer_id: null,
          customer_name: 'Customer Three',
          notes: null,
          digiflazz_response: null,
          created_at: yesterday,
          updated_at: yesterday
        }
      ]).execute();

      const result = await getRevenueAnalytics('daily', 7);

      expect(result.revenue_data.length).toBeGreaterThan(0);
      expect(result.total_revenue).toEqual(46500); // 10500 + 15500 + 20500
      expect(result.total_transactions).toEqual(3);

      // Find today's data
      const todayStr = today.toISOString().split('T')[0];
      const todayData = result.revenue_data.find(d => d.date === todayStr);
      if (todayData) {
        expect(todayData.revenue).toEqual(26000); // 10500 + 15500
        expect(todayData.transaction_count).toEqual(2);
      }

      // Check numeric types
      result.revenue_data.forEach(data => {
        expect(typeof data.revenue).toBe('number');
        expect(typeof data.transaction_count).toBe('number');
      });
    });

    it('should exclude non-successful transactions from analytics', async () => {
      // Create test user and product
      const userResult = await db.insert(usersTable).values({
        email: 'user@example.com',
        password_hash: 'hash',
        full_name: 'Test User',
        phone_number: '081234567890',
        referral_code: 'REF001',
        referred_by_id: null
      }).returning().execute();

      const productResult = await db.insert(productsTable).values({
        sku: 'TEST_PRODUCT_001',
        name: 'Test Product',
        description: 'A test product',
        category: 'mobile_credit',
        price: '10000.00',
        base_price: '9500.00',
        provider: 'TestProvider',
        is_active: true,
        denomination_type: 'fixed'
      }).returning().execute();

      // Create transactions with different statuses
      await db.insert(transactionsTable).values([
        {
          user_id: userResult[0].id,
          product_id: productResult[0].id,
          transaction_id: 'TXN_001',
          external_transaction_id: 'EXT_001',
          amount: '10000.00',
          price: '10500.00',
          status: 'success',
          customer_phone: '081234567890',
          customer_id: null,
          customer_name: 'Customer One',
          notes: null,
          digiflazz_response: null
        },
        {
          user_id: userResult[0].id,
          product_id: productResult[0].id,
          transaction_id: 'TXN_002',
          external_transaction_id: 'EXT_002',
          amount: '15000.00',
          price: '15500.00',
          status: 'failed',
          customer_phone: '081234567891',
          customer_id: null,
          customer_name: 'Customer Two',
          notes: null,
          digiflazz_response: null
        },
        {
          user_id: userResult[0].id,
          product_id: productResult[0].id,
          transaction_id: 'TXN_003',
          external_transaction_id: 'EXT_003',
          amount: '20000.00',
          price: '20500.00',
          status: 'pending',
          customer_phone: '081234567892',
          customer_id: null,
          customer_name: 'Customer Three',
          notes: null,
          digiflazz_response: null
        }
      ]).execute();

      const result = await getRevenueAnalytics('daily', 7);

      // Should only include the successful transaction
      expect(result.total_revenue).toEqual(10500);
      expect(result.total_transactions).toEqual(1);
    });

    it('should handle different period types', async () => {
      // Create test user and product
      const userResult = await db.insert(usersTable).values({
        email: 'user@example.com',
        password_hash: 'hash',
        full_name: 'Test User',
        phone_number: '081234567890',
        referral_code: 'REF001',
        referred_by_id: null
      }).returning().execute();

      const productResult = await db.insert(productsTable).values({
        sku: 'TEST_PRODUCT_001',
        name: 'Test Product',
        description: 'A test product',
        category: 'mobile_credit',
        price: '10000.00',
        base_price: '9500.00',
        provider: 'TestProvider',
        is_active: true,
        denomination_type: 'fixed'
      }).returning().execute();

      // Create successful transaction
      await db.insert(transactionsTable).values({
        user_id: userResult[0].id,
        product_id: productResult[0].id,
        transaction_id: 'TXN_001',
        external_transaction_id: 'EXT_001',
        amount: '10000.00',
        price: '10500.00',
        status: 'success',
        customer_phone: '081234567890',
        customer_id: null,
        customer_name: 'Customer One',
        notes: null,
        digiflazz_response: null
      }).execute();

      // Test weekly analytics
      const weeklyResult = await getRevenueAnalytics('weekly', 30);
      expect(weeklyResult.total_revenue).toEqual(10500);
      expect(weeklyResult.total_transactions).toEqual(1);

      // Test monthly analytics
      const monthlyResult = await getRevenueAnalytics('monthly', 90);
      expect(monthlyResult.total_revenue).toEqual(10500);
      expect(monthlyResult.total_transactions).toEqual(1);
    });
  });
});