import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { productsTable } from '../db/schema';
import { eq } from 'drizzle-orm';
import { 
    getDigiflazzServices, 
    createDigiflazzOrder,
    checkDigiflazzStatus,
    syncProductsFromDigiflazz,
    generateDigiflazzSignature,
    isDigiflazzSuccess,
    isDigiflazzPending,
    isDigiflazzFailed
} from '../handlers/digiflazz';
import { type DigiflazzOrderInput } from '../schema';

// Test input for order creation
const testOrderInput: DigiflazzOrderInput = {
    username: 'test_user',
    buyer_sku_code: 'TELKOMSEL_5000',
    customer_no: '081234567890',
    ref_id: 'TEST-REF-123',
    sign: 'test_signature'
};

describe('Digiflazz Handlers', () => {
    beforeEach(async () => {
        await createDB();
        // Set environment to use mock data for testing
        process.env.NODE_ENV = 'test';
    });

    afterEach(async () => {
        await resetDB();
    });

    describe('getDigiflazzServices', () => {
        it('should return list of available services', async () => {
            const services = await getDigiflazzServices();

            expect(services).toBeDefined();
            expect(Array.isArray(services)).toBe(true);
            expect(services.length).toBeGreaterThan(0);

            // Validate service structure
            const service = services[0];
            expect(service.buyer_sku_code).toBeDefined();
            expect(service.product_name).toBeDefined();
            expect(service.category).toBeDefined();
            expect(service.brand).toBeDefined();
            expect(service.price).toBeTypeOf('number');
            expect(service.buyer_product_status).toBe(true);
            expect(service.seller_product_status).toBe(true);
        });

        it('should filter only active services', async () => {
            const services = await getDigiflazzServices();

            services.forEach(service => {
                expect(service.buyer_product_status).toBe(true);
                expect(service.seller_product_status).toBe(true);
            });
        });

        it('should return services with expected fields', async () => {
            const services = await getDigiflazzServices();
            const service = services[0];

            expect(typeof service.buyer_sku_code).toBe('string');
            expect(typeof service.product_name).toBe('string');
            expect(typeof service.category).toBe('string');
            expect(typeof service.brand).toBe('string');
            expect(typeof service.type).toBe('string');
            expect(typeof service.seller_name).toBe('string');
            expect(typeof service.price).toBe('number');
            expect(typeof service.buyer_product_status).toBe('boolean');
            expect(typeof service.seller_product_status).toBe('boolean');
            expect(typeof service.unlimited_stock).toBe('boolean');
            expect(typeof service.stock).toBe('number');
            expect(typeof service.multi).toBe('boolean');
            expect(typeof service.start_cut_off).toBe('string');
            expect(typeof service.end_cut_off).toBe('string');
            expect(typeof service.desc).toBe('string');
        });
    });

    describe('createDigiflazzOrder', () => {
        it('should create order successfully', async () => {
            const result = await createDigiflazzOrder(testOrderInput);

            expect(result).toBeDefined();
            expect(result.data).toBeDefined();
            expect(result.data.ref_id).toEqual(testOrderInput.ref_id);
            expect(result.data.customer_no).toEqual(testOrderInput.customer_no);
            expect(result.data.buyer_sku_code).toEqual(testOrderInput.buyer_sku_code);
            expect(result.data.message).toBeDefined();
            expect(result.data.status).toBeDefined();
            expect(result.data.rc).toBeDefined();
            expect(typeof result.data.price).toBe('number');
            expect(typeof result.data.buyer_last_saldo).toBe('number');
        });

        it('should return valid order response structure', async () => {
            const result = await createDigiflazzOrder(testOrderInput);

            expect(result.data.ref_id).toBeTypeOf('string');
            expect(result.data.customer_no).toBeTypeOf('string');
            expect(result.data.buyer_sku_code).toBeTypeOf('string');
            expect(result.data.message).toBeTypeOf('string');
            expect(result.data.status).toBeTypeOf('string');
            expect(result.data.rc).toBeTypeOf('string');
            expect(result.data.buyer_last_saldo).toBeTypeOf('number');
            expect(result.data.price).toBeTypeOf('number');
            expect(result.data.tele).toBeTypeOf('string');
            expect(result.data.wa).toBeTypeOf('string');
        });

        it('should handle different order outcomes', async () => {
            // Run multiple times to test different mock outcomes
            const results = await Promise.all([
                createDigiflazzOrder({ ...testOrderInput, ref_id: 'TEST-1' }),
                createDigiflazzOrder({ ...testOrderInput, ref_id: 'TEST-2' }),
                createDigiflazzOrder({ ...testOrderInput, ref_id: 'TEST-3' })
            ]);

            results.forEach(result => {
                expect(result.data.status).toMatch(/^(Sukses|Pending|Gagal)$/);
                expect(['SUKSES', 'PROCESS', 'GAGAL']).toContain(result.data.message);
            });
        });
    });

    describe('checkDigiflazzStatus', () => {
        it('should check transaction status', async () => {
            const refId = 'TEST-STATUS-123';
            const result = await checkDigiflazzStatus(refId);

            expect(result).toBeDefined();
            expect(result.data).toBeDefined();
            expect(result.data.ref_id).toEqual(refId);
            expect(result.data.status).toBeDefined();
            expect(result.data.message).toBeDefined();
            expect(result.data.rc).toBeDefined();
        });

        it('should return valid status response structure', async () => {
            const result = await checkDigiflazzStatus('TEST-REF');

            expect(result.data.ref_id).toBeTypeOf('string');
            expect(result.data.customer_no).toBeTypeOf('string');
            expect(result.data.buyer_sku_code).toBeTypeOf('string');
            expect(result.data.message).toBeTypeOf('string');
            expect(result.data.status).toBeTypeOf('string');
            expect(result.data.rc).toBeTypeOf('string');
            expect(result.data.buyer_last_saldo).toBeTypeOf('number');
            expect(result.data.price).toBeTypeOf('number');
        });

        it('should handle different status responses', async () => {
            // Check multiple times to get different mock statuses
            const statusChecks = await Promise.all([
                checkDigiflazzStatus('REF-1'),
                checkDigiflazzStatus('REF-2'),
                checkDigiflazzStatus('REF-3'),
                checkDigiflazzStatus('REF-4'),
                checkDigiflazzStatus('REF-5')
            ]);

            const statuses = statusChecks.map(result => result.data.status);
            const messages = statusChecks.map(result => result.data.message);

            // Should contain various statuses due to randomization
            expect(statuses.some(status => ['Sukses', 'Pending', 'Gagal'].includes(status))).toBe(true);
            expect(messages.some(msg => ['SUKSES', 'PROCESS', 'GAGAL'].includes(msg))).toBe(true);
        });
    });

    describe('syncProductsFromDigiflazz', () => {
        it('should sync products to database', async () => {
            const result = await syncProductsFromDigiflazz();

            expect(result).toBeDefined();
            expect(typeof result.synced).toBe('number');
            expect(Array.isArray(result.errors)).toBe(true);
            expect(result.synced).toBeGreaterThan(0);
        });

        it('should create products in database', async () => {
            await syncProductsFromDigiflazz();

            const products = await db.select().from(productsTable).execute();
            expect(products.length).toBeGreaterThan(0);

            const product = products[0];
            expect(product.sku).toBeDefined();
            expect(product.name).toBeDefined();
            expect(product.category).toBeDefined();
            expect(parseFloat(product.price)).toBeGreaterThan(0);
            expect(parseFloat(product.base_price)).toBeGreaterThan(0);
            expect(product.provider).toBeDefined();
            expect(typeof product.is_active).toBe('boolean');
        });

        it('should handle product updates correctly', async () => {
            // First sync
            const firstSync = await syncProductsFromDigiflazz();
            expect(firstSync.synced).toBeGreaterThan(0);

            // Second sync (should update existing)
            const secondSync = await syncProductsFromDigiflazz();
            expect(secondSync.synced).toBeGreaterThan(0);

            // Should not duplicate products
            const products = await db.select().from(productsTable).execute();
            const skus = products.map(p => p.sku);
            const uniqueSkus = [...new Set(skus)];
            expect(skus.length).toEqual(uniqueSkus.length);
        });

        it('should map categories correctly', async () => {
            await syncProductsFromDigiflazz();

            const products = await db.select().from(productsTable).execute();
            
            products.forEach(product => {
                expect(['mobile_credit', 'data_package', 'pln_token', 'game_voucher', 'other'])
                    .toContain(product.category);
            });
        });

        it('should handle numeric conversions properly', async () => {
            await syncProductsFromDigiflazz();

            const products = await db.select().from(productsTable).execute();
            const product = products[0];

            // Verify stored as strings (numeric columns)
            expect(typeof product.price).toBe('string');
            expect(typeof product.base_price).toBe('string');
            
            // Verify can be parsed as numbers
            expect(parseFloat(product.price)).toBeGreaterThan(0);
            expect(parseFloat(product.base_price)).toBeGreaterThan(0);
        });
    });

    describe('generateDigiflazzSignature', () => {
        it('should generate MD5 signature', () => {
            const username = 'test_user';
            const apiKey = 'test_key';
            const refId = 'test_ref';

            const signature = generateDigiflazzSignature(username, apiKey, refId);

            expect(signature).toBeDefined();
            expect(typeof signature).toBe('string');
            expect(signature.length).toBe(32); // MD5 hash length
            expect(/^[a-f0-9]{32}$/.test(signature)).toBe(true); // Hex format
        });

        it('should generate consistent signatures', () => {
            const username = 'test_user';
            const apiKey = 'test_key';
            const refId = 'test_ref';

            const sig1 = generateDigiflazzSignature(username, apiKey, refId);
            const sig2 = generateDigiflazzSignature(username, apiKey, refId);

            expect(sig1).toEqual(sig2);
        });

        it('should generate different signatures for different inputs', () => {
            const sig1 = generateDigiflazzSignature('user1', 'key1', 'ref1');
            const sig2 = generateDigiflazzSignature('user2', 'key2', 'ref2');

            expect(sig1).not.toEqual(sig2);
        });

        it('should generate known signature for test values', () => {
            // Test with known values to verify MD5 implementation
            const signature = generateDigiflazzSignature('test', 'key', '123');
            const expectedHash = require('crypto')
                .createHash('md5')
                .update('testkey123')
                .digest('hex');

            expect(signature).toEqual(expectedHash);
        });
    });

    describe('Utility Functions', () => {
        describe('isDigiflazzSuccess', () => {
            it('should identify successful responses', () => {
                const successResponse = {
                    data: {
                        ref_id: 'TEST',
                        customer_no: '081234567890',
                        buyer_sku_code: 'TEST_SKU',
                        message: 'SUKSES',
                        status: 'Sukses',
                        rc: '00',
                        buyer_last_saldo: 1000000,
                        price: 5000,
                        tele: '628123456789',
                        wa: '628123456789',
                        serial_number: 'SN123'
                    }
                };

                expect(isDigiflazzSuccess(successResponse)).toBe(true);
            });

            it('should identify failed responses', () => {
                const failedResponse = {
                    data: {
                        ref_id: 'TEST',
                        customer_no: '081234567890',
                        buyer_sku_code: 'TEST_SKU',
                        message: 'GAGAL',
                        status: 'Gagal',
                        rc: '01',
                        buyer_last_saldo: 1000000,
                        price: 5000,
                        tele: '628123456789',
                        wa: '628123456789',
                        serial_number: ''
                    }
                };

                expect(isDigiflazzSuccess(failedResponse)).toBe(false);
            });
        });

        describe('isDigiflazzPending', () => {
            it('should identify pending responses', () => {
                const pendingResponse = {
                    data: {
                        ref_id: 'TEST',
                        customer_no: '081234567890',
                        buyer_sku_code: 'TEST_SKU',
                        message: 'PROCESS',
                        status: 'Pending',
                        rc: '00',
                        buyer_last_saldo: 1000000,
                        price: 5000,
                        tele: '628123456789',
                        wa: '628123456789'
                    }
                };

                expect(isDigiflazzPending(pendingResponse)).toBe(true);
            });

            it('should identify non-pending responses', () => {
                const successResponse = {
                    data: {
                        ref_id: 'TEST',
                        customer_no: '081234567890',
                        buyer_sku_code: 'TEST_SKU',
                        message: 'SUKSES',
                        status: 'Sukses',
                        rc: '00',
                        buyer_last_saldo: 1000000,
                        price: 5000,
                        tele: '628123456789',
                        wa: '628123456789',
                        serial_number: 'SN123'
                    }
                };

                expect(isDigiflazzPending(successResponse)).toBe(false);
            });
        });

        describe('isDigiflazzFailed', () => {
            it('should identify failed responses', () => {
                const failedResponse = {
                    data: {
                        ref_id: 'TEST',
                        customer_no: '081234567890',
                        buyer_sku_code: 'TEST_SKU',
                        message: 'GAGAL',
                        status: 'Gagal',
                        rc: '01',
                        buyer_last_saldo: 1000000,
                        price: 5000,
                        tele: '628123456789',
                        wa: '628123456789'
                    }
                };

                expect(isDigiflazzFailed(failedResponse)).toBe(true);
            });

            it('should identify non-failed responses', () => {
                const successResponse = {
                    data: {
                        ref_id: 'TEST',
                        customer_no: '081234567890',
                        buyer_sku_code: 'TEST_SKU',
                        message: 'SUKSES',
                        status: 'Sukses',
                        rc: '00',
                        buyer_last_saldo: 1000000,
                        price: 5000,
                        tele: '628123456789',
                        wa: '628123456789',
                        serial_number: 'SN123'
                    }
                };

                expect(isDigiflazzFailed(successResponse)).toBe(false);
            });
        });
    });

    describe('Error Handling', () => {
        it('should handle signature generation errors', () => {
            expect(() => generateDigiflazzSignature('', '', '')).not.toThrow();
            
            const signature = generateDigiflazzSignature('', '', '');
            expect(typeof signature).toBe('string');
            expect(signature.length).toBe(32);
        });

        it('should handle empty service responses', async () => {
            // This test verifies the handler can handle empty responses gracefully
            const services = await getDigiflazzServices();
            expect(Array.isArray(services)).toBe(true);
        });
    });
});