import { db } from '../db';
import { usersTable } from '../db/schema';
import { type RegisterInput, type LoginInput, type AuthResponse } from '../schema';
import { eq } from 'drizzle-orm';
import { createHash, randomBytes, pbkdf2Sync } from 'crypto';

// JWT secret - in production this should come from environment variables
const JWT_SECRET = process.env['JWT_SECRET'] || 'your-secret-key';

// Generate a unique referral code
function generateReferralCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'REF';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Hash password using Node.js crypto
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

// Verify password
function verifyPassword(password: string, hashedPassword: string): boolean {
  const [salt, hash] = hashedPassword.split(':');
  const verifyHash = pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return hash === verifyHash;
}

// Simple JWT implementation using Node.js crypto
function generateToken(userId: number): string {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const payload = {
    userId,
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  
  const signature = createHash('sha256')
    .update(`${encodedHeader}.${encodedPayload}.${JWT_SECRET}`)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

// Verify JWT token
function verifyJWT(token: string): { userId: number } {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid token format');
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  
  // Verify signature
  const expectedSignature = createHash('sha256')
    .update(`${encodedHeader}.${encodedPayload}.${JWT_SECRET}`)
    .digest('base64url');

  if (signature !== expectedSignature) {
    throw new Error('Invalid token signature');
  }

  // Decode payload
  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString());
  
  // Check expiration
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired');
  }

  return { userId: payload.userId };
}

// Register a new user with optional referral code
export async function register(input: RegisterInput): Promise<AuthResponse> {
  try {
    // Check if user already exists
    const existingUser = await db.select()
      .from(usersTable)
      .where(eq(usersTable.email, input.email))
      .execute();

    if (existingUser.length > 0) {
      throw new Error('User with this email already exists');
    }

    // Hash password
    const passwordHash = hashPassword(input.password);

    // Generate unique referral code
    let referralCode: string;
    let isUnique = false;
    do {
      referralCode = generateReferralCode();
      const existingCode = await db.select()
        .from(usersTable)
        .where(eq(usersTable.referral_code, referralCode))
        .execute();
      isUnique = existingCode.length === 0;
    } while (!isUnique);

    // Check if referral code exists and find referrer
    let referrerId: number | null = null;
    if (input.referral_code) {
      const referrer = await db.select()
        .from(usersTable)
        .where(eq(usersTable.referral_code, input.referral_code))
        .execute();
      
      if (referrer.length > 0) {
        referrerId = referrer[0].id;
      }
    }

    // Insert new user
    const result = await db.insert(usersTable)
      .values({
        email: input.email,
        password_hash: passwordHash,
        full_name: input.full_name,
        phone_number: input.phone_number || null,
        referral_code: referralCode,
        referred_by_id: referrerId
      })
      .returning()
      .execute();

    const newUser = result[0];

    // Generate JWT token
    const token = generateToken(newUser.id);

    // Return user data without password and token
    return {
      user: {
        id: newUser.id,
        email: newUser.email,
        full_name: newUser.full_name,
        phone_number: newUser.phone_number,
        referral_code: newUser.referral_code,
        referred_by_id: newUser.referred_by_id,
        created_at: newUser.created_at,
        updated_at: newUser.updated_at
      },
      token
    };
  } catch (error) {
    console.error('User registration failed:', error);
    throw error;
  }
}

// Login user with email and password
export async function login(input: LoginInput): Promise<AuthResponse> {
  try {
    // Find user by email
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.email, input.email))
      .execute();

    if (users.length === 0) {
      throw new Error('Invalid email or password');
    }

    const user = users[0];

    // Verify password
    const isValidPassword = verifyPassword(input.password, user.password_hash);
    if (!isValidPassword) {
      throw new Error('Invalid email or password');
    }

    // Generate JWT token
    const token = generateToken(user.id);

    // Return user data without password and token
    return {
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        phone_number: user.phone_number,
        referral_code: user.referral_code,
        referred_by_id: user.referred_by_id,
        created_at: user.created_at,
        updated_at: user.updated_at
      },
      token
    };
  } catch (error) {
    console.error('User login failed:', error);
    throw error;
  }
}

// Verify JWT token and return user data
export async function verifyToken(token: string): Promise<AuthResponse['user']> {
  try {
    // Verify and decode JWT token
    const decoded = verifyJWT(token);

    // Find user by ID from token payload
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, decoded.userId))
      .execute();

    if (users.length === 0) {
      throw new Error('User not found');
    }

    const user = users[0];

    // Return user data without password
    return {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      phone_number: user.phone_number,
      referral_code: user.referral_code,
      referred_by_id: user.referred_by_id,
      created_at: user.created_at,
      updated_at: user.updated_at
    };
  } catch (error) {
    console.error('Token verification failed:', error);
    throw error;
  }
}