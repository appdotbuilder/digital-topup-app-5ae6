import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type RegisterInput, type LoginInput } from '../schema';
import { register, login, verifyToken } from '../handlers/auth';
import { eq } from 'drizzle-orm';
import { pbkdf2Sync, createHash } from 'crypto';

// Test inputs
const testRegisterInput: RegisterInput = {
  email: 'test@example.com',
  password: 'password123',
  full_name: 'Test User',
  phone_number: '+1234567890',
  referral_code: 'REFERRER123'
};

const testLoginInput: LoginInput = {
  email: 'test@example.com',
  password: 'password123'
};

// Helper function to verify password hash
function verifyPasswordHash(password: string, hashedPassword: string): boolean {
  const [salt, hash] = hashedPassword.split(':');
  const verifyHash = pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return hash === verifyHash;
}

// Helper function to decode JWT payload
function decodeJWTPayload(token: string): any {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  } catch {
    return null;
  }
}

describe('Auth Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('register', () => {
    it('should register a new user successfully', async () => {
      const result = await register(testRegisterInput);

      // Verify response structure
      expect(result.user).toBeDefined();
      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe('string');

      // Verify user data
      expect(result.user.email).toBe(testRegisterInput.email);
      expect(result.user.full_name).toBe(testRegisterInput.full_name);
      expect(result.user.phone_number).toBe(testRegisterInput.phone_number || null);
      expect(result.user.id).toBeDefined();
      expect(result.user.referral_code).toBeDefined();
      expect(result.user.referral_code).toMatch(/^REF[A-Z0-9]{6}$/);
      expect(result.user.created_at).toBeInstanceOf(Date);
      expect(result.user.updated_at).toBeInstanceOf(Date);

      // Verify user was saved to database
      const users = await db.select()
        .from(usersTable)
        .where(eq(usersTable.email, testRegisterInput.email))
        .execute();

      expect(users).toHaveLength(1);
      expect(users[0].email).toBe(testRegisterInput.email);
      expect(users[0].full_name).toBe(testRegisterInput.full_name);
      
      // Verify password was hashed
      expect(users[0].password_hash).not.toBe(testRegisterInput.password);
      const isPasswordValid = verifyPasswordHash(testRegisterInput.password, users[0].password_hash);
      expect(isPasswordValid).toBe(true);
    });

    it('should register user without optional fields', async () => {
      const inputWithoutOptionals: RegisterInput = {
        email: 'test2@example.com',
        password: 'password123',
        full_name: 'Test User 2'
      };

      const result = await register(inputWithoutOptionals);

      expect(result.user.email).toBe(inputWithoutOptionals.email);
      expect(result.user.full_name).toBe(inputWithoutOptionals.full_name);
      expect(result.user.phone_number).toBeNull();
      expect(result.user.referred_by_id).toBeNull();
    });

    it('should handle referral code correctly', async () => {
      // First, create a referrer user
      const referrerInput: RegisterInput = {
        email: 'referrer@example.com',
        password: 'password123',
        full_name: 'Referrer User'
      };

      const referrer = await register(referrerInput);
      
      // Now register a user with the referrer's code
      const referredInput: RegisterInput = {
        email: 'referred@example.com',
        password: 'password123',
        full_name: 'Referred User',
        referral_code: referrer.user.referral_code
      };

      const referred = await register(referredInput);

      expect(referred.user.referred_by_id).toBe(referrer.user.id);
    });

    it('should handle invalid referral code gracefully', async () => {
      const inputWithInvalidReferral: RegisterInput = {
        email: 'test3@example.com',
        password: 'password123',
        full_name: 'Test User 3',
        referral_code: 'INVALID123'
      };

      const result = await register(inputWithInvalidReferral);

      // Should still register successfully but with null referred_by_id
      expect(result.user.referred_by_id).toBeNull();
      expect(result.user.email).toBe(inputWithInvalidReferral.email);
    });

    it('should generate unique referral codes', async () => {
      const input1: RegisterInput = {
        email: 'user1@example.com',
        password: 'password123',
        full_name: 'User One'
      };

      const input2: RegisterInput = {
        email: 'user2@example.com',
        password: 'password123',
        full_name: 'User Two'
      };

      const [result1, result2] = await Promise.all([
        register(input1),
        register(input2)
      ]);

      expect(result1.user.referral_code).not.toBe(result2.user.referral_code);
      expect(result1.user.referral_code).toMatch(/^REF[A-Z0-9]{6}$/);
      expect(result2.user.referral_code).toMatch(/^REF[A-Z0-9]{6}$/);
    });

    it('should reject registration with duplicate email', async () => {
      // Register first user
      await register(testRegisterInput);

      // Try to register with same email
      const duplicateInput: RegisterInput = {
        email: testRegisterInput.email,
        password: 'differentpassword',
        full_name: 'Different User'
      };

      await expect(register(duplicateInput)).rejects.toThrow(/already exists/i);
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      // Create a user to login with
      await register(testRegisterInput);
    });

    it('should login user with correct credentials', async () => {
      const result = await login(testLoginInput);

      expect(result.user).toBeDefined();
      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe('string');

      expect(result.user.email).toBe(testLoginInput.email);
      expect(result.user.full_name).toBe(testRegisterInput.full_name);
      expect(result.user.phone_number).toBe(testRegisterInput.phone_number || null);
      expect(result.user.referral_code).toBeDefined();
    });

    it('should reject login with invalid email', async () => {
      const invalidEmailInput: LoginInput = {
        email: 'nonexistent@example.com',
        password: testLoginInput.password
      };

      await expect(login(invalidEmailInput)).rejects.toThrow(/invalid email or password/i);
    });

    it('should reject login with invalid password', async () => {
      const invalidPasswordInput: LoginInput = {
        email: testLoginInput.email,
        password: 'wrongpassword'
      };

      await expect(login(invalidPasswordInput)).rejects.toThrow(/invalid email or password/i);
    });

    it('should generate valid JWT token on login', async () => {
      const result = await login(testLoginInput);

      // Verify token can be decoded
      const payload = decodeJWTPayload(result.token);
      
      expect(payload).toBeDefined();
      expect(payload.userId).toBe(result.user.id);
      expect(payload.exp).toBeDefined();
    });
  });

  describe('verifyToken', () => {
    let validToken: string;
    let userId: number;

    beforeEach(async () => {
      // Register and login to get a valid token
      const registerResult = await register(testRegisterInput);
      const loginResult = await login(testLoginInput);
      validToken = loginResult.token;
      userId = loginResult.user.id;
    });

    it('should verify valid token and return user data', async () => {
      const result = await verifyToken(validToken);

      expect(result.id).toBe(userId);
      expect(result.email).toBe(testRegisterInput.email);
      expect(result.full_name).toBe(testRegisterInput.full_name);
      expect(result.phone_number).toBe(testRegisterInput.phone_number || null);
      expect(result.referral_code).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should reject invalid token', async () => {
      const invalidToken = 'invalid.jwt.token';

      await expect(verifyToken(invalidToken)).rejects.toThrow();
    });

    it('should reject expired token', async () => {
      // Create an expired token manually
      const JWT_SECRET = process.env['JWT_SECRET'] || 'your-secret-key';
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ 
        userId, 
        exp: Math.floor(Date.now() / 1000) - 3600 // 1 hour ago
      })).toString('base64url');
      const signature = createHash('sha256')
        .update(`${header}.${payload}.${JWT_SECRET}`)
        .digest('base64url');
      const expiredToken = `${header}.${payload}.${signature}`;

      await expect(verifyToken(expiredToken)).rejects.toThrow(/expired/i);
    });

    it('should reject token for non-existent user', async () => {
      // Create token for non-existent user
      const JWT_SECRET = process.env['JWT_SECRET'] || 'your-secret-key';
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ 
        userId: 99999,
        exp: Math.floor(Date.now() / 1000) + 3600
      })).toString('base64url');
      const signature = createHash('sha256')
        .update(`${header}.${payload}.${JWT_SECRET}`)
        .digest('base64url');
      const tokenForNonExistentUser = `${header}.${payload}.${signature}`;

      await expect(verifyToken(tokenForNonExistentUser)).rejects.toThrow(/user not found/i);
    });

    it('should handle malformed token', async () => {
      const malformedToken = 'malformed';

      await expect(verifyToken(malformedToken)).rejects.toThrow();
    });

    it('should reject token with invalid signature', async () => {
      // Create token with wrong signature
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ 
        userId,
        exp: Math.floor(Date.now() / 1000) + 3600
      })).toString('base64url');
      const wrongSignature = 'wrong-signature';
      const tokenWithWrongSignature = `${header}.${payload}.${wrongSignature}`;

      await expect(verifyToken(tokenWithWrongSignature)).rejects.toThrow(/signature/i);
    });
  });
});