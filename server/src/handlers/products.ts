import { db } from '../db';
import { productsTable } from '../db/schema';
import { type Product, type GetProductsInput, type ProductCategory } from '../schema';
import { eq, and, ilike, asc, SQL } from 'drizzle-orm';

// Get all active products with optional filtering
export async function getProducts(input?: GetProductsInput): Promise<Product[]> {
  try {
    const conditions: SQL<unknown>[] = [];

    // Apply filters if provided
    if (input?.category) {
      conditions.push(eq(productsTable.category, input.category));
    }

    if (input?.is_active !== undefined) {
      conditions.push(eq(productsTable.is_active, input.is_active));
    }

    if (input?.search) {
      conditions.push(ilike(productsTable.name, `%${input.search}%`));
    }

    // Build final query
    const results = conditions.length > 0
      ? await db.select()
          .from(productsTable)
          .where(conditions.length === 1 ? conditions[0] : and(...conditions))
          .orderBy(asc(productsTable.name))
          .execute()
      : await db.select()
          .from(productsTable)
          .orderBy(asc(productsTable.name))
          .execute();

    // Convert numeric fields back to numbers
    return results.map(product => ({
      ...product,
      price: parseFloat(product.price),
      base_price: parseFloat(product.base_price),
      min_amount: product.min_amount ? parseFloat(product.min_amount) : null,
      max_amount: product.max_amount ? parseFloat(product.max_amount) : null
    }));
  } catch (error) {
    console.error('Failed to get products:', error);
    throw error;
  }
}

// Get product by ID
export async function getProductById(id: number): Promise<Product | null> {
  try {
    const results = await db.select()
      .from(productsTable)
      .where(eq(productsTable.id, id))
      .execute();

    if (results.length === 0) {
      return null;
    }

    const product = results[0];
    
    // Convert numeric fields back to numbers
    return {
      ...product,
      price: parseFloat(product.price),
      base_price: parseFloat(product.base_price),
      min_amount: product.min_amount ? parseFloat(product.min_amount) : null,
      max_amount: product.max_amount ? parseFloat(product.max_amount) : null
    };
  } catch (error) {
    console.error('Failed to get product by ID:', error);
    throw error;
  }
}

// Get products by category
export async function getProductsByCategory(category: string): Promise<Product[]> {
  try {
    const results = await db.select()
      .from(productsTable)
      .where(and(
        eq(productsTable.category, category as ProductCategory),
        eq(productsTable.is_active, true)
      ))
      .orderBy(asc(productsTable.price))
      .execute();

    // Convert numeric fields back to numbers
    return results.map(product => ({
      ...product,
      price: parseFloat(product.price),
      base_price: parseFloat(product.base_price),
      min_amount: product.min_amount ? parseFloat(product.min_amount) : null,
      max_amount: product.max_amount ? parseFloat(product.max_amount) : null
    }));
  } catch (error) {
    console.error('Failed to get products by category:', error);
    throw error;
  }
}