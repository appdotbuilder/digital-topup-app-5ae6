import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, transactionsTable, referralsTable, productsTable } from '../db/schema';
import { 
  processReferralCommission,
  getUserReferralEarnings,
  getUserReferrals,
  validateReferralCode,
  markReferralAsPaid
} from '../handlers/referrals';
import { eq } from 'drizzle-orm';

// Test data
const testReferrer = {
  email: 'referrer@example.com',
  password_hash: 'hashedpassword123',
  full_name: 'John Referrer',
  phone_number: '+1234567890',
  referral_code: 'REF123',
  referred_by_id: null
};

const testReferred = {
  email: 'referred@example.com',
  password_hash: 'hashedpassword456',
  full_name: 'Jane Referred',
  phone_number: '+0987654321',
  referral_code: 'REF456',
  referred_by_id: 1 // Will be set after creating referrer
};

const testProduct = {
  sku: 'TEST_PROD_001',
  name: 'Test Product',
  description: 'A test product',
  category: 'mobile_credit' as const,
  price: '10000.00',
  base_price: '9500.00',
  provider: 'Test Provider',
  is_active: true,
  denomination_type: 'fixed' as const
};

describe('referrals handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('processReferralCommission', () => {
    it('should create referral commission for referred user transaction', async () => {
      // Create referrer user
      const referrerResult = await db.insert(usersTable)
        .values(testReferrer)
        .returning()
        .execute();
      const referrerId = referrerResult[0].id;

      // Create referred user
      const referredResult = await db.insert(usersTable)
        .values({ ...testReferred, referred_by_id: referrerId })
        .returning()
        .execute();
      const referredId = referredResult[0].id;

      // Create product
      const productResult = await db.insert(productsTable)
        .values(testProduct)
        .returning()
        .execute();
      const productId = productResult[0].id;

      // Create transaction
      const transactionResult = await db.insert(transactionsTable)
        .values({
          user_id: referredId,
          product_id: productId,
          transaction_id: 'TXN_001',
          amount: '10000.00',
          price: '10000.00',
          status: 'success'
        })
        .returning()
        .execute();
      const transactionId = transactionResult[0].id;

      // Process referral commission
      const referral = await processReferralCommission(transactionId);

      // Verify referral was created
      expect(referral).toBeDefined();
      expect(referral!.referrer_id).toBe(referrerId);
      expect(referral!.referred_id).toBe(referredId);
      expect(referral!.transaction_id).toBe(transactionId);
      expect(referral!.commission_amount).toBe(500); // 5% of 10000
      expect(referral!.is_paid).toBe(false);
      expect(referral!.created_at).toBeInstanceOf(Date);
    });

    it('should return null if transaction does not exist', async () => {
      const result = await processReferralCommission(999);
      expect(result).toBeNull();
    });

    it('should return null if user was not referred', async () => {
      // Create user without referrer
      const userResult = await db.insert(usersTable)
        .values({ ...testReferrer, referred_by_id: null })
        .returning()
        .execute();
      const userId = userResult[0].id;

      // Create product
      const productResult = await db.insert(productsTable)
        .values(testProduct)
        .returning()
        .execute();
      const productId = productResult[0].id;

      // Create transaction
      const transactionResult = await db.insert(transactionsTable)
        .values({
          user_id: userId,
          product_id: productId,
          transaction_id: 'TXN_002',
          amount: '10000.00',
          price: '10000.00',
          status: 'success'
        })
        .returning()
        .execute();
      const transactionId = transactionResult[0].id;

      const result = await processReferralCommission(transactionId);
      expect(result).toBeNull();
    });

    it('should calculate correct commission amount', async () => {
      // Create referrer user
      const referrerResult = await db.insert(usersTable)
        .values(testReferrer)
        .returning()
        .execute();
      const referrerId = referrerResult[0].id;

      // Create referred user
      const referredResult = await db.insert(usersTable)
        .values({ ...testReferred, referred_by_id: referrerId })
        .returning()
        .execute();
      const referredId = referredResult[0].id;

      // Create product
      const productResult = await db.insert(productsTable)
        .values(testProduct)
        .returning()
        .execute();
      const productId = productResult[0].id;

      // Create transaction with different amount
      const transactionResult = await db.insert(transactionsTable)
        .values({
          user_id: referredId,
          product_id: productId,
          transaction_id: 'TXN_003',
          amount: '25000.00',
          price: '25000.00',
          status: 'success'
        })
        .returning()
        .execute();
      const transactionId = transactionResult[0].id;

      const referral = await processReferralCommission(transactionId);

      expect(referral!.commission_amount).toBe(1250); // 5% of 25000
    });
  });

  describe('getUserReferralEarnings', () => {
    it('should return correct earnings summary', async () => {
      // Create referrer user
      const referrerResult = await db.insert(usersTable)
        .values(testReferrer)
        .returning()
        .execute();
      const referrerId = referrerResult[0].id;

      // Create multiple referral records
      const referralData = [
        { commission_amount: '500.00', is_paid: false },
        { commission_amount: '750.00', is_paid: true },
        { commission_amount: '300.00', is_paid: false }
      ];

      for (const data of referralData) {
        await db.insert(referralsTable)
          .values({
            referrer_id: referrerId,
            referred_id: 2,
            commission_amount: data.commission_amount,
            transaction_id: 1,
            is_paid: data.is_paid
          })
          .execute();
      }

      const earnings = await getUserReferralEarnings(referrerId);

      expect(earnings.total_earnings).toBe(1550); // 500 + 750 + 300
      expect(earnings.pending_earnings).toBe(800); // 500 + 300
      expect(earnings.paid_earnings).toBe(750); // 750
      expect(earnings.total_referrals).toBe(3);
      expect(earnings.referrals).toHaveLength(3);
    });

    it('should return zero earnings for user with no referrals', async () => {
      const earnings = await getUserReferralEarnings(999);

      expect(earnings.total_earnings).toBe(0);
      expect(earnings.pending_earnings).toBe(0);
      expect(earnings.paid_earnings).toBe(0);
      expect(earnings.total_referrals).toBe(0);
      expect(earnings.referrals).toHaveLength(0);
    });

    it('should convert numeric fields correctly', async () => {
      // Create referrer user
      const referrerResult = await db.insert(usersTable)
        .values(testReferrer)
        .returning()
        .execute();
      const referrerId = referrerResult[0].id;

      // Create referral record
      await db.insert(referralsTable)
        .values({
          referrer_id: referrerId,
          referred_id: 2,
          commission_amount: '123.45',
          transaction_id: 1,
          is_paid: false
        })
        .execute();

      const earnings = await getUserReferralEarnings(referrerId);

      expect(typeof earnings.total_earnings).toBe('number');
      expect(earnings.total_earnings).toBe(123.45);
      expect(typeof earnings.referrals[0].commission_amount).toBe('number');
    });
  });

  describe('getUserReferrals', () => {
    it('should return referred users with transaction statistics', async () => {
      // Create referrer user
      const referrerResult = await db.insert(usersTable)
        .values(testReferrer)
        .returning()
        .execute();
      const referrerId = referrerResult[0].id;

      // Create referred user
      const referredResult = await db.insert(usersTable)
        .values({ ...testReferred, referred_by_id: referrerId })
        .returning()
        .execute();
      const referredId = referredResult[0].id;

      // Create product
      const productResult = await db.insert(productsTable)
        .values(testProduct)
        .returning()
        .execute();
      const productId = productResult[0].id;

      // Create successful transactions
      await db.insert(transactionsTable)
        .values({
          user_id: referredId,
          product_id: productId,
          transaction_id: 'TXN_001',
          amount: '10000.00',
          price: '10000.00',
          status: 'success'
        })
        .execute();

      await db.insert(transactionsTable)
        .values({
          user_id: referredId,
          product_id: productId,
          transaction_id: 'TXN_002',
          amount: '15000.00',
          price: '15000.00',
          status: 'success'
        })
        .execute();

      // Create failed transaction (should not be counted)
      await db.insert(transactionsTable)
        .values({
          user_id: referredId,
          product_id: productId,
          transaction_id: 'TXN_003',
          amount: '5000.00',
          price: '5000.00',
          status: 'failed'
        })
        .execute();

      const referrals = await getUserReferrals(referrerId);

      expect(referrals.total_referred).toBe(1);
      expect(referrals.referred_users).toHaveLength(1);

      const referredUser = referrals.referred_users[0];
      expect(referredUser.id).toBe(referredId);
      expect(referredUser.full_name).toBe(testReferred.full_name);
      expect(referredUser.email).toBe(testReferred.email);
      expect(referredUser.joined_date).toBeInstanceOf(Date);
      expect(referredUser.total_transactions).toBe(2); // Only successful ones
      expect(referredUser.total_spent).toBe(25000); // 10000 + 15000
      expect(typeof referredUser.total_spent).toBe('number');
    });

    it('should return empty list for user with no referrals', async () => {
      const referrals = await getUserReferrals(999);

      expect(referrals.total_referred).toBe(0);
      expect(referrals.referred_users).toHaveLength(0);
    });

    it('should handle users with no transactions', async () => {
      // Create referrer user
      const referrerResult = await db.insert(usersTable)
        .values(testReferrer)
        .returning()
        .execute();
      const referrerId = referrerResult[0].id;

      // Create referred user with no transactions
      const referredResult = await db.insert(usersTable)
        .values({ ...testReferred, referred_by_id: referrerId })
        .returning()
        .execute();

      const referrals = await getUserReferrals(referrerId);

      expect(referrals.total_referred).toBe(1);
      const referredUser = referrals.referred_users[0];
      expect(referredUser.total_transactions).toBe(0);
      expect(referredUser.total_spent).toBe(0);
    });
  });

  describe('validateReferralCode', () => {
    it('should validate existing referral code', async () => {
      // Create user with referral code
      await db.insert(usersTable)
        .values(testReferrer)
        .execute();

      const result = await validateReferralCode('REF123');

      expect(result.valid).toBe(true);
      expect(result.referrer_id).toBe(1);
      expect(result.referrer_name).toBe('John Referrer');
    });

    it('should return invalid for non-existent referral code', async () => {
      const result = await validateReferralCode('INVALID123');

      expect(result.valid).toBe(false);
      expect(result.referrer_id).toBeUndefined();
      expect(result.referrer_name).toBeUndefined();
    });

    it('should handle empty referral code', async () => {
      const result = await validateReferralCode('');

      expect(result.valid).toBe(false);
    });
  });

  describe('markReferralAsPaid', () => {
    it('should mark referral as paid', async () => {
      // Create referrer user
      const referrerResult = await db.insert(usersTable)
        .values(testReferrer)
        .returning()
        .execute();
      const referrerId = referrerResult[0].id;

      // Create referral record
      const referralResult = await db.insert(referralsTable)
        .values({
          referrer_id: referrerId,
          referred_id: 2,
          commission_amount: '500.00',
          transaction_id: 1,
          is_paid: false
        })
        .returning()
        .execute();
      const referralId = referralResult[0].id;

      const result = await markReferralAsPaid(referralId);

      expect(result).toBeDefined();
      expect(result!.id).toBe(referralId);
      expect(result!.is_paid).toBe(true);
      expect(result!.commission_amount).toBe(500);
      expect(typeof result!.commission_amount).toBe('number');

      // Verify in database
      const updatedReferral = await db.select()
        .from(referralsTable)
        .where(eq(referralsTable.id, referralId))
        .execute();

      expect(updatedReferral[0].is_paid).toBe(true);
    });

    it('should return null for non-existent referral', async () => {
      const result = await markReferralAsPaid(999);
      expect(result).toBeNull();
    });

    it('should handle already paid referral', async () => {
      // Create referrer user
      const referrerResult = await db.insert(usersTable)
        .values(testReferrer)
        .returning()
        .execute();
      const referrerId = referrerResult[0].id;

      // Create already paid referral record
      const referralResult = await db.insert(referralsTable)
        .values({
          referrer_id: referrerId,
          referred_id: 2,
          commission_amount: '500.00',
          transaction_id: 1,
          is_paid: true
        })
        .returning()
        .execute();
      const referralId = referralResult[0].id;

      const result = await markReferralAsPaid(referralId);

      expect(result).toBeDefined();
      expect(result!.is_paid).toBe(true);
    });
  });
});