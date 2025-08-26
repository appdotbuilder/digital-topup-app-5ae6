import { db } from '../db';
import { usersTable, transactionsTable, productsTable } from '../db/schema';
import { type AdminStats, type Transaction, type User } from '../schema';
import { count, eq, desc, sql, and, gte, lte } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

// Get admin dashboard statistics
export async function getAdminStats(): Promise<AdminStats> {
  try {
    // Count total users
    const totalUsersResult = await db.select({ count: count() })
      .from(usersTable)
      .execute();
    
    const totalUsers = totalUsersResult[0]?.count || 0;

    // Count total transactions
    const totalTransactionsResult = await db.select({ count: count() })
      .from(transactionsTable)
      .execute();
    
    const totalTransactions = totalTransactionsResult[0]?.count || 0;

    // Calculate total revenue from successful transactions
    const totalRevenueResult = await db.select({ 
      total: sql<string>`COALESCE(SUM(${transactionsTable.price}), 0)` 
    })
      .from(transactionsTable)
      .where(eq(transactionsTable.status, 'success'))
      .execute();
    
    const totalRevenue = parseFloat(totalRevenueResult[0]?.total || '0');

    // Count transactions by status
    const statusCountsResult = await db.select({
      status: transactionsTable.status,
      count: count()
    })
      .from(transactionsTable)
      .groupBy(transactionsTable.status)
      .execute();

    // Initialize status counts
    let pendingTransactions = 0;
    let successfulTransactions = 0;
    let failedTransactions = 0;

    // Map status counts
    statusCountsResult.forEach(row => {
      switch (row.status) {
        case 'pending':
        case 'processing':
          pendingTransactions += row.count;
          break;
        case 'success':
          successfulTransactions += row.count;
          break;
        case 'failed':
        case 'cancelled':
          failedTransactions += row.count;
          break;
      }
    });

    return {
      total_users: totalUsers,
      total_transactions: totalTransactions,
      total_revenue: totalRevenue,
      pending_transactions: pendingTransactions,
      successful_transactions: successfulTransactions,
      failed_transactions: failedTransactions
    };
  } catch (error) {
    console.error('Failed to get admin stats:', error);
    throw error;
  }
}

// Get all transactions for admin monitoring (with pagination)
export async function getAllTransactions(page: number = 1, limit: number = 50): Promise<{
  transactions: Transaction[],
  total: number,
  page: number,
  limit: number
}> {
  try {
    const offset = (page - 1) * limit;

    // Get total count
    const totalResult = await db.select({ count: count() })
      .from(transactionsTable)
      .execute();
    
    const total = totalResult[0]?.count || 0;

    // Get paginated transactions with ordering
    const transactionsResult = await db.select()
      .from(transactionsTable)
      .orderBy(desc(transactionsTable.created_at))
      .limit(limit)
      .offset(offset)
      .execute();

    // Convert numeric fields to numbers
    const transactions: Transaction[] = transactionsResult.map(transaction => ({
      ...transaction,
      amount: parseFloat(transaction.amount),
      price: parseFloat(transaction.price),
      digiflazz_response: transaction.digiflazz_response as Record<string, any> | null
    }));

    return {
      transactions,
      total,
      page,
      limit
    };
  } catch (error) {
    console.error('Failed to get all transactions:', error);
    throw error;
  }
}

// Get all users for admin management
export async function getAllUsers(page: number = 1, limit: number = 50): Promise<{
  users: User[],
  total: number,
  page: number,
  limit: number
}> {
  try {
    const offset = (page - 1) * limit;

    // Get total count
    const totalResult = await db.select({ count: count() })
      .from(usersTable)
      .execute();
    
    const total = totalResult[0]?.count || 0;

    // Get paginated users with ordering (exclude password_hash for security)
    const usersResult = await db.select({
      id: usersTable.id,
      email: usersTable.email,
      full_name: usersTable.full_name,
      phone_number: usersTable.phone_number,
      referral_code: usersTable.referral_code,
      referred_by_id: usersTable.referred_by_id,
      created_at: usersTable.created_at,
      updated_at: usersTable.updated_at
    })
      .from(usersTable)
      .orderBy(desc(usersTable.created_at))
      .limit(limit)
      .offset(offset)
      .execute();

    // Add password_hash as empty string to match User type (for type compatibility)
    const users: User[] = usersResult.map(user => ({
      ...user,
      password_hash: '' // Excluded for security
    }));

    return {
      users,
      total,
      page,
      limit
    };
  } catch (error) {
    console.error('Failed to get all users:', error);
    throw error;
  }
}

// Get revenue analytics by period
export async function getRevenueAnalytics(
  period: 'daily' | 'weekly' | 'monthly' = 'daily', 
  days: number = 30
): Promise<{
  revenue_data: Array<{ date: string, revenue: number, transaction_count: number }>,
  total_revenue: number,
  total_transactions: number
}> {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);

    // Build conditions array for where clause
    const conditions: SQL<unknown>[] = [
      eq(transactionsTable.status, 'success'),
      gte(transactionsTable.created_at, startDate),
      lte(transactionsTable.created_at, endDate)
    ];

    // Define date truncation and query based on period
    let revenueDataResult: any[];

    if (period === 'weekly') {
      revenueDataResult = await db.select({
        date: sql<string>`TO_CHAR(DATE_TRUNC('week', ${transactionsTable.created_at}), 'YYYY-MM-DD')`,
        revenue: sql<string>`COALESCE(SUM(${transactionsTable.price}), 0)`,
        transaction_count: count()
      })
        .from(transactionsTable)
        .where(and(...conditions))
        .groupBy(sql`DATE_TRUNC('week', ${transactionsTable.created_at})`)
        .orderBy(sql`DATE_TRUNC('week', ${transactionsTable.created_at})`)
        .execute();
    } else if (period === 'monthly') {
      revenueDataResult = await db.select({
        date: sql<string>`TO_CHAR(DATE_TRUNC('month', ${transactionsTable.created_at}), 'YYYY-MM-DD')`,
        revenue: sql<string>`COALESCE(SUM(${transactionsTable.price}), 0)`,
        transaction_count: count()
      })
        .from(transactionsTable)
        .where(and(...conditions))
        .groupBy(sql`DATE_TRUNC('month', ${transactionsTable.created_at})`)
        .orderBy(sql`DATE_TRUNC('month', ${transactionsTable.created_at})`)
        .execute();
    } else {
      // daily
      revenueDataResult = await db.select({
        date: sql<string>`TO_CHAR(DATE_TRUNC('day', ${transactionsTable.created_at}), 'YYYY-MM-DD')`,
        revenue: sql<string>`COALESCE(SUM(${transactionsTable.price}), 0)`,
        transaction_count: count()
      })
        .from(transactionsTable)
        .where(and(...conditions))
        .groupBy(sql`DATE_TRUNC('day', ${transactionsTable.created_at})`)
        .orderBy(sql`DATE_TRUNC('day', ${transactionsTable.created_at})`)
        .execute();
    }

    // Convert revenue to numbers and format data
    const revenueData = revenueDataResult.map(row => ({
      date: row.date,
      revenue: parseFloat(row.revenue),
      transaction_count: row.transaction_count
    }));

    // Calculate totals
    const totalRevenue = revenueData.reduce((sum, row) => sum + row.revenue, 0);
    const totalTransactions = revenueData.reduce((sum, row) => sum + row.transaction_count, 0);

    return {
      revenue_data: revenueData,
      total_revenue: totalRevenue,
      total_transactions: totalTransactions
    };
  } catch (error) {
    console.error('Failed to get revenue analytics:', error);
    throw error;
  }
}