import crypto from 'crypto';
import { db } from '../db';
import { productsTable } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { 
    type DigiflazzService, 
    type DigiflazzOrderInput, 
    type DigiflazzOrderResponse,
    type ProductCategory
} from '../schema';

// Environment variables (would be loaded from process.env in production)
const DIGIFLAZZ_USERNAME = process.env['DIGIFLAZZ_USERNAME'] || 'demo_username';
const DIGIFLAZZ_API_KEY = process.env['DIGIFLAZZ_API_KEY'] || 'demo_api_key';
const DIGIFLAZZ_BASE_URL = process.env['DIGIFLAZZ_BASE_URL'] || 'https://api.digiflazz.com/v1';
const USE_MOCK_DATA = process.env['NODE_ENV'] === 'test' || process.env['USE_MOCK_DIGIFLAZZ'] === 'true';

// Mock data for development and testing
const MOCK_SERVICES: DigiflazzService[] = [
    {
        buyer_sku_code: 'TELKOMSEL_5000',
        product_name: 'Telkomsel 5.000',
        category: 'Pulsa',
        brand: 'TELKOMSEL',
        type: 'Pulsa',
        seller_name: 'DIGIFLAZZ',
        price: 5275,
        buyer_product_status: true,
        seller_product_status: true,
        unlimited_stock: true,
        stock: 999999,
        multi: false,
        start_cut_off: '00:00',
        end_cut_off: '23:59',
        desc: 'Pulsa Telkomsel 5.000'
    },
    {
        buyer_sku_code: 'XL_10000',
        product_name: 'XL 10.000',
        category: 'Pulsa',
        brand: 'XL',
        type: 'Pulsa',
        seller_name: 'DIGIFLAZZ',
        price: 10250,
        buyer_product_status: true,
        seller_product_status: true,
        unlimited_stock: true,
        stock: 999999,
        multi: false,
        start_cut_off: '00:00',
        end_cut_off: '23:59',
        desc: 'Pulsa XL 10.000'
    },
    {
        buyer_sku_code: 'PLN_20000',
        product_name: 'PLN Token 20.000',
        category: 'PLN',
        brand: 'PLN',
        type: 'PLN',
        seller_name: 'DIGIFLAZZ',
        price: 20500,
        buyer_product_status: true,
        seller_product_status: true,
        unlimited_stock: true,
        stock: 999999,
        multi: false,
        start_cut_off: '00:00',
        end_cut_off: '23:59',
        desc: 'Token PLN 20.000'
    }
];

// Get available services from Digiflazz (or mock)
export async function getDigiflazzServices(): Promise<DigiflazzService[]> {
    try {
        if (USE_MOCK_DATA) {
            // Return mock data for testing/development
            return MOCK_SERVICES.filter(service => 
                service.buyer_product_status && service.seller_product_status
            );
        }

        // In production, make actual API call
        const response = await fetch(`${DIGIFLAZZ_BASE_URL}/price-list`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                cmd: 'prepaid',
                username: DIGIFLAZZ_USERNAME,
                sign: generateDigiflazzSignature(DIGIFLAZZ_USERNAME, DIGIFLAZZ_API_KEY, 'pricelist')
            })
        });

        if (!response.ok) {
            throw new Error(`Digiflazz API error: ${response.status}`);
        }

        const data = await response.json() as { data: DigiflazzService[] };
        
        // Filter active and available services
        return data.data.filter((service: DigiflazzService) => 
            service.buyer_product_status && 
            service.seller_product_status &&
            service.stock > 0
        );

    } catch (error) {
        console.error('Failed to get Digiflazz services:', error);
        throw error;
    }
}

// Create order at Digiflazz (or mock)
export async function createDigiflazzOrder(input: DigiflazzOrderInput): Promise<DigiflazzOrderResponse> {
    try {
        if (USE_MOCK_DATA) {
            // Return mock response for testing/development
            const isSuccess = Math.random() > 0.3; // 70% success rate for testing
            return {
                data: {
                    ref_id: input.ref_id,
                    customer_no: input.customer_no,
                    buyer_sku_code: input.buyer_sku_code,
                    message: isSuccess ? 'SUKSES' : 'PROCESS',
                    status: isSuccess ? 'Sukses' : 'Pending',
                    rc: '00',
                    buyer_last_saldo: 1000000,
                    price: 5275,
                    tele: '62895000000',
                    wa: '62895000000',
                    serial_number: isSuccess ? 'SN123456789' : ''
                }
            };
        }

        // In production, make actual API call
        const response = await fetch(`${DIGIFLAZZ_BASE_URL}/transaction`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                cmd: 'pay-pasca',
                ...input
            })
        });

        if (!response.ok) {
            throw new Error(`Digiflazz order API error: ${response.status}`);
        }

        const data = await response.json();
        return data as DigiflazzOrderResponse;

    } catch (error) {
        console.error('Failed to create Digiflazz order:', error);
        throw error;
    }
}

// Check transaction status at Digiflazz
export async function checkDigiflazzStatus(refId: string): Promise<DigiflazzOrderResponse> {
    try {
        if (USE_MOCK_DATA) {
            // Return mock status for testing/development
            const statuses = ['Sukses', 'Pending', 'Gagal'];
            const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
            
            return {
                data: {
                    ref_id: refId,
                    customer_no: '081234567890',
                    buyer_sku_code: 'TELKOMSEL_5000',
                    message: randomStatus === 'Sukses' ? 'SUKSES' : randomStatus === 'Gagal' ? 'GAGAL' : 'PROCESS',
                    status: randomStatus,
                    rc: randomStatus === 'Sukses' ? '00' : '01',
                    buyer_last_saldo: 994725,
                    price: 5275,
                    tele: '62895000000',
                    wa: '62895000000',
                    serial_number: randomStatus === 'Sukses' ? 'SN123456789' : ''
                }
            };
        }

        // In production, make actual API call
        const signature = generateDigiflazzSignature(DIGIFLAZZ_USERNAME, DIGIFLAZZ_API_KEY, refId);
        
        const response = await fetch(`${DIGIFLAZZ_BASE_URL}/transaction/status`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                cmd: 'status-pasca',
                username: DIGIFLAZZ_USERNAME,
                ref_id: refId,
                sign: signature
            })
        });

        if (!response.ok) {
            throw new Error(`Digiflazz status API error: ${response.status}`);
        }

        const data = await response.json();
        return data as DigiflazzOrderResponse;

    } catch (error) {
        console.error('Failed to check Digiflazz status:', error);
        throw error;
    }
}

// Map Digiflazz categories to our product categories
function mapDigiflazzCategory(digiflazzCategory: string, brand: string): ProductCategory {
    const category = digiflazzCategory.toLowerCase();
    const brandLower = brand.toLowerCase();

    if (category.includes('pulsa') || category.includes('credit')) {
        return 'mobile_credit';
    }
    if (category.includes('data') || category.includes('internet')) {
        return 'data_package';
    }
    if (category.includes('pln') || brandLower.includes('pln')) {
        return 'pln_token';
    }
    if (category.includes('game') || category.includes('voucher')) {
        return 'game_voucher';
    }
    
    return 'other';
}

// Sync products from Digiflazz to local database
export async function syncProductsFromDigiflazz(): Promise<{ 
    synced: number, 
    errors: string[] 
}> {
    try {
        const services = await getDigiflazzServices();
        const errors: string[] = [];
        let synced = 0;

        for (const service of services) {
            try {
                // Check if product already exists
                const existingProduct = await db.select()
                    .from(productsTable)
                    .where(eq(productsTable.sku, service.buyer_sku_code))
                    .limit(1)
                    .execute();

                const productData = {
                    sku: service.buyer_sku_code,
                    name: service.product_name,
                    description: service.desc,
                    category: mapDigiflazzCategory(service.category, service.brand),
                    price: service.price.toString(),
                    base_price: service.price.toString(),
                    provider: service.seller_name,
                    is_active: service.buyer_product_status && service.seller_product_status,
                    min_amount: service.multi ? '1'.toString() : null,
                    max_amount: service.unlimited_stock ? null : service.stock.toString(),
                    denomination_type: service.multi ? 'range' as const : 'fixed' as const,
                    image_url: null,
                    updated_at: new Date()
                };

                if (existingProduct.length > 0) {
                    // Update existing product
                    await db.update(productsTable)
                        .set(productData)
                        .where(eq(productsTable.sku, service.buyer_sku_code))
                        .execute();
                } else {
                    // Insert new product
                    await db.insert(productsTable)
                        .values({
                            ...productData,
                            created_at: new Date()
                        })
                        .execute();
                }

                synced++;
            } catch (error) {
                const errorMsg = `Failed to sync product ${service.buyer_sku_code}: ${error}`;
                console.error(errorMsg);
                errors.push(errorMsg);
            }
        }

        return { synced, errors };

    } catch (error) {
        console.error('Failed to sync products from Digiflazz:', error);
        throw error;
    }
}

// Generate MD5 signature for Digiflazz API
export function generateDigiflazzSignature(username: string, apiKey: string, refId: string): string {
    try {
        const signatureString = `${username}${apiKey}${refId}`;
        return crypto.createHash('md5').update(signatureString).digest('hex');
    } catch (error) {
        console.error('Failed to generate Digiflazz signature:', error);
        throw error;
    }
}

// Utility function to validate Digiflazz response status
export function isDigiflazzSuccess(response: DigiflazzOrderResponse): boolean {
    return response.data.status === 'Sukses' && response.data.rc === '00';
}

// Utility function to check if transaction is still processing
export function isDigiflazzPending(response: DigiflazzOrderResponse): boolean {
    return response.data.status === 'Pending' || 
           response.data.status === 'Process' ||
           response.data.message === 'PROCESS';
}

// Utility function to check if transaction failed
export function isDigiflazzFailed(response: DigiflazzOrderResponse): boolean {
    return response.data.status === 'Gagal' || 
           response.data.message === 'GAGAL' ||
           (response.data.rc !== '00' && response.data.status !== 'Pending');
}