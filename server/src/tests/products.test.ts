import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { productsTable } from '../db/schema';
import { type GetProductsInput } from '../schema';
import { getProducts, getProductById, getProductsByCategory } from '../handlers/products';
import { eq } from 'drizzle-orm';

// Test products data
const testProducts = [
  {
    sku: 'TELKOMSEL_5K',
    name: 'Telkomsel 5,000',
    description: 'Telkomsel credit 5,000 IDR',
    category: 'mobile_credit' as const,
    price: '5500.00',
    base_price: '5000.00',
    provider: 'Telkomsel',
    is_active: true,
    min_amount: null,
    max_amount: null,
    denomination_type: 'fixed' as const,
    image_url: '/images/telkomsel.png'
  },
  {
    sku: 'XL_10K',
    name: 'XL 10,000',
    description: 'XL credit 10,000 IDR',
    category: 'mobile_credit' as const,
    price: '10500.00',
    base_price: '10000.00',
    provider: 'XL',
    is_active: true,
    min_amount: null,
    max_amount: null,
    denomination_type: 'fixed' as const,
    image_url: '/images/xl.png'
  },
  {
    sku: 'INDOSAT_DATA_1GB',
    name: 'Indosat Data 1GB',
    description: 'Indosat data package 1GB',
    category: 'data_package' as const,
    price: '15000.00',
    base_price: '14000.00',
    provider: 'Indosat',
    is_active: true,
    min_amount: null,
    max_amount: null,
    denomination_type: 'fixed' as const,
    image_url: '/images/indosat.png'
  },
  {
    sku: 'PLN_TOKEN_20K',
    name: 'PLN Token 20,000',
    description: 'PLN electricity token 20,000 IDR',
    category: 'pln_token' as const,
    price: '20500.00',
    base_price: '20000.00',
    provider: 'PLN',
    is_active: false, // Inactive product for testing
    min_amount: '10000.00',
    max_amount: '50000.00',
    denomination_type: 'range' as const,
    image_url: '/images/pln.png'
  }
];

describe('Products handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  beforeEach(async () => {
    // Insert test products
    await db.insert(productsTable).values(testProducts);
  });

  describe('getProducts', () => {
    it('should return all products when no filters provided', async () => {
      const result = await getProducts();

      expect(result).toHaveLength(4);
      expect(result[0].name).toEqual('Indosat Data 1GB'); // Ordered by name
      expect(result[1].name).toEqual('PLN Token 20,000');
      expect(result[2].name).toEqual('Telkomsel 5,000');
      expect(result[3].name).toEqual('XL 10,000');
      
      // Check numeric conversions
      expect(typeof result[0].price).toBe('number');
      expect(typeof result[0].base_price).toBe('number');
      expect(result[0].price).toEqual(15000);
      expect(result[0].base_price).toEqual(14000);
    });

    it('should filter by category', async () => {
      const input: GetProductsInput = {
        category: 'mobile_credit'
      };

      const result = await getProducts(input);

      expect(result).toHaveLength(2);
      result.forEach(product => {
        expect(product.category).toEqual('mobile_credit');
      });
      expect(result[0].name).toEqual('Telkomsel 5,000');
      expect(result[1].name).toEqual('XL 10,000');
    });

    it('should filter by is_active status', async () => {
      const input: GetProductsInput = {
        is_active: true
      };

      const result = await getProducts(input);

      expect(result).toHaveLength(3);
      result.forEach(product => {
        expect(product.is_active).toBe(true);
      });
    });

    it('should filter by inactive status', async () => {
      const input: GetProductsInput = {
        is_active: false
      };

      const result = await getProducts(input);

      expect(result).toHaveLength(1);
      expect(result[0].is_active).toBe(false);
      expect(result[0].name).toEqual('PLN Token 20,000');
    });

    it('should search by product name', async () => {
      const input: GetProductsInput = {
        search: 'Telkomsel'
      };

      const result = await getProducts(input);

      expect(result).toHaveLength(1);
      expect(result[0].name).toEqual('Telkomsel 5,000');
      expect(result[0].provider).toEqual('Telkomsel');
    });

    it('should search case-insensitively', async () => {
      const input: GetProductsInput = {
        search: 'telkomsel'
      };

      const result = await getProducts(input);

      expect(result).toHaveLength(1);
      expect(result[0].name).toEqual('Telkomsel 5,000');
    });

    it('should search by partial name match', async () => {
      const input: GetProductsInput = {
        search: 'Data'
      };

      const result = await getProducts(input);

      expect(result).toHaveLength(1);
      expect(result[0].name).toEqual('Indosat Data 1GB');
    });

    it('should combine multiple filters', async () => {
      const input: GetProductsInput = {
        category: 'mobile_credit',
        is_active: true,
        search: 'XL'
      };

      const result = await getProducts(input);

      expect(result).toHaveLength(1);
      expect(result[0].name).toEqual('XL 10,000');
      expect(result[0].category).toEqual('mobile_credit');
      expect(result[0].is_active).toBe(true);
    });

    it('should return empty array when no products match filters', async () => {
      const input: GetProductsInput = {
        category: 'game_voucher'
      };

      const result = await getProducts(input);

      expect(result).toHaveLength(0);
    });

    it('should handle range denomination products correctly', async () => {
      const input: GetProductsInput = {
        category: 'pln_token'
      };

      const result = await getProducts(input);

      expect(result).toHaveLength(1);
      expect(result[0].denomination_type).toEqual('range');
      expect(result[0].min_amount).toEqual(10000);
      expect(result[0].max_amount).toEqual(50000);
      expect(typeof result[0].min_amount).toBe('number');
      expect(typeof result[0].max_amount).toBe('number');
    });

    it('should handle null min/max amounts correctly', async () => {
      const input: GetProductsInput = {
        category: 'mobile_credit'
      };

      const result = await getProducts(input);

      result.forEach(product => {
        expect(product.min_amount).toBeNull();
        expect(product.max_amount).toBeNull();
      });
    });
  });

  describe('getProductById', () => {
    it('should return product when ID exists', async () => {
      // Get the first product's ID
      const products = await db.select().from(productsTable).limit(1);
      const productId = products[0].id;

      const result = await getProductById(productId);

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(productId);
      expect(result!.sku).toEqual('TELKOMSEL_5K');
      expect(result!.name).toEqual('Telkomsel 5,000');
      
      // Check numeric conversions
      expect(typeof result!.price).toBe('number');
      expect(typeof result!.base_price).toBe('number');
      expect(result!.price).toEqual(5500);
      expect(result!.base_price).toEqual(5000);
    });

    it('should return null when ID does not exist', async () => {
      const result = await getProductById(99999);

      expect(result).toBeNull();
    });

    it('should handle product with range denomination', async () => {
      // Get PLN token product ID
      const products = await db.select()
        .from(productsTable)
        .where(eq(productsTable.sku, 'PLN_TOKEN_20K'));
      const productId = products[0].id;

      const result = await getProductById(productId);

      expect(result).not.toBeNull();
      expect(result!.denomination_type).toEqual('range');
      expect(result!.min_amount).toEqual(10000);
      expect(result!.max_amount).toEqual(50000);
      expect(typeof result!.min_amount).toBe('number');
      expect(typeof result!.max_amount).toBe('number');
    });

    it('should return inactive products', async () => {
      // Get PLN token product ID (which is inactive)
      const products = await db.select()
        .from(productsTable)
        .where(eq(productsTable.sku, 'PLN_TOKEN_20K'));
      const productId = products[0].id;

      const result = await getProductById(productId);

      expect(result).not.toBeNull();
      expect(result!.is_active).toBe(false);
    });
  });

  describe('getProductsByCategory', () => {
    it('should return active products for valid category', async () => {
      const result = await getProductsByCategory('mobile_credit');

      expect(result).toHaveLength(2);
      result.forEach(product => {
        expect(product.category).toEqual('mobile_credit');
        expect(product.is_active).toBe(true);
      });
      
      // Should be ordered by price
      expect(result[0].price).toBeLessThanOrEqual(result[1].price);
      expect(result[0].name).toEqual('Telkomsel 5,000');
      expect(result[1].name).toEqual('XL 10,000');
    });

    it('should return empty array for category with no active products', async () => {
      const result = await getProductsByCategory('pln_token');

      expect(result).toHaveLength(0);
    });

    it('should return empty array for non-existent category', async () => {
      const result = await getProductsByCategory('game_voucher');

      expect(result).toHaveLength(0);
    });

    it('should only return active products', async () => {
      const result = await getProductsByCategory('data_package');

      expect(result).toHaveLength(1);
      expect(result[0].is_active).toBe(true);
      expect(result[0].name).toEqual('Indosat Data 1GB');
    });

    it('should handle numeric conversions correctly', async () => {
      const result = await getProductsByCategory('data_package');

      expect(result).toHaveLength(1);
      expect(typeof result[0].price).toBe('number');
      expect(typeof result[0].base_price).toBe('number');
      expect(result[0].price).toEqual(15000);
      expect(result[0].base_price).toEqual(14000);
    });

    it('should order products by price ascending', async () => {
      const result = await getProductsByCategory('mobile_credit');

      expect(result).toHaveLength(2);
      expect(result[0].price).toBeLessThan(result[1].price);
      expect(result[0].price).toEqual(5500);
      expect(result[1].price).toEqual(10500);
    });
  });
});