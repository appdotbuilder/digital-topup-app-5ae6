import { db } from '../db';
import { usersTable, transactionsTable, referralsTable, productsTable } from '../db/schema';
import { type Referral } from '../schema';
import { eq, and, sum, count, sql } from 'drizzle-orm';

// Process referral commission after successful transaction
export async function processReferralCommission(transactionId: number): Promise<Referral | null> {
  try {
    // Get transaction details with user information
    const transactionResult = await db.select({
      transaction: transactionsTable,
      user: usersTable
    })
    .from(transactionsTable)
    .innerJoin(usersTable, eq(transactionsTable.user_id, usersTable.id))
    .where(eq(transactionsTable.id, transactionId))
    .execute();

    if (transactionResult.length === 0) {
      return null;
    }

    const { transaction, user } = transactionResult[0];

    // Check if user was referred by someone
    if (!user.referred_by_id) {
      return null;
    }

    // Calculate commission amount (5% of transaction price)
    const commissionRate = 0.05;
    const commissionAmount = parseFloat(transaction.price) * commissionRate;

    // Create referral commission record
    const referralResult = await db.insert(referralsTable)
      .values({
        referrer_id: user.referred_by_id,
        referred_id: user.id,
        commission_amount: commissionAmount.toString(),
        transaction_id: transactionId,
        is_paid: false
      })
      .returning()
      .execute();

    const referral = referralResult[0];
    return {
      ...referral,
      commission_amount: parseFloat(referral.commission_amount)
    };
  } catch (error) {
    console.error('Process referral commission failed:', error);
    throw error;
  }
}

// Get referral earnings for a user
export async function getUserReferralEarnings(userId: number): Promise<{
  total_earnings: number,
  pending_earnings: number,
  paid_earnings: number,
  total_referrals: number,
  referrals: Referral[]
}> {
  try {
    // Get all referrals for this user
    const referrals = await db.select()
      .from(referralsTable)
      .where(eq(referralsTable.referrer_id, userId))
      .execute();

    // Convert numeric fields
    const convertedReferrals = referrals.map(referral => ({
      ...referral,
      commission_amount: parseFloat(referral.commission_amount)
    }));

    // Calculate totals
    const totalEarnings = convertedReferrals.reduce((sum, r) => sum + r.commission_amount, 0);
    const pendingEarnings = convertedReferrals
      .filter(r => !r.is_paid)
      .reduce((sum, r) => sum + r.commission_amount, 0);
    const paidEarnings = convertedReferrals
      .filter(r => r.is_paid)
      .reduce((sum, r) => sum + r.commission_amount, 0);

    return {
      total_earnings: totalEarnings,
      pending_earnings: pendingEarnings,
      paid_earnings: paidEarnings,
      total_referrals: convertedReferrals.length,
      referrals: convertedReferrals
    };
  } catch (error) {
    console.error('Get user referral earnings failed:', error);
    throw error;
  }
}

// Get users referred by a specific user
export async function getUserReferrals(userId: number): Promise<{
  referred_users: Array<{
    id: number,
    full_name: string,
    email: string,
    joined_date: Date,
    total_transactions: number,
    total_spent: number
  }>,
  total_referred: number
}> {
  try {
    // Get referred users with their transaction statistics
    const referredUsers = await db.select({
      id: usersTable.id,
      full_name: usersTable.full_name,
      email: usersTable.email,
      joined_date: usersTable.created_at,
      total_transactions: count(transactionsTable.id),
      total_spent: sql<string>`COALESCE(SUM(${transactionsTable.price}), 0)`
    })
    .from(usersTable)
    .leftJoin(transactionsTable, and(
      eq(transactionsTable.user_id, usersTable.id),
      eq(transactionsTable.status, 'success')
    ))
    .where(eq(usersTable.referred_by_id, userId))
    .groupBy(usersTable.id, usersTable.full_name, usersTable.email, usersTable.created_at)
    .execute();

    // Convert numeric fields and format data
    const formattedUsers = referredUsers.map(user => ({
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      joined_date: user.joined_date,
      total_transactions: user.total_transactions,
      total_spent: parseFloat(user.total_spent)
    }));

    return {
      referred_users: formattedUsers,
      total_referred: formattedUsers.length
    };
  } catch (error) {
    console.error('Get user referrals failed:', error);
    throw error;
  }
}

// Validate referral code exists
export async function validateReferralCode(referralCode: string): Promise<{
  valid: boolean,
  referrer_id?: number,
  referrer_name?: string
}> {
  try {
    // Check if referral code exists in users table
    const users = await db.select({
      id: usersTable.id,
      full_name: usersTable.full_name
    })
    .from(usersTable)
    .where(eq(usersTable.referral_code, referralCode))
    .execute();

    if (users.length === 0) {
      return { valid: false };
    }

    const user = users[0];
    return {
      valid: true,
      referrer_id: user.id,
      referrer_name: user.full_name
    };
  } catch (error) {
    console.error('Validate referral code failed:', error);
    throw error;
  }
}

// Mark referral commission as paid (admin function)
export async function markReferralAsPaid(referralId: number): Promise<Referral | null> {
  try {
    // Update referral record to mark as paid
    const updatedReferrals = await db.update(referralsTable)
      .set({ is_paid: true })
      .where(eq(referralsTable.id, referralId))
      .returning()
      .execute();

    if (updatedReferrals.length === 0) {
      return null;
    }

    const referral = updatedReferrals[0];
    return {
      ...referral,
      commission_amount: parseFloat(referral.commission_amount)
    };
  } catch (error) {
    console.error('Mark referral as paid failed:', error);
    throw error;
  }
}