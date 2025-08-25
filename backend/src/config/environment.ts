import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  
  // Database
  DATABASE_URL: z.string(),
  
  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),
  
  // JWT
  JWT_SECRET: z.string(),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  
  // Frontend
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  
  // Email (Nodemailer)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().transform(Number).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  
  // SMS (Twilio)
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
  
  // File Upload
  UPLOAD_MAX_SIZE: z.string().transform(Number).default('10485760'), // 10MB
  UPLOAD_ALLOWED_TYPES: z.string().default('image/jpeg,image/png,image/webp'),
  
  // QR Code
  QR_CODE_ERROR_CORRECTION: z.enum(['L', 'M', 'Q', 'H']).default('M'),
  QR_CODE_SIZE: z.string().transform(Number).default('200'),
  
  // Voice Processing
  VOICE_API_KEY: z.string().optional(),
  VOICE_MODEL: z.string().default('base'),
  
  // Puppeteer
  PUPPETEER_HEADLESS: z.string().transform(val => val === 'true').default('true'),
  PUPPETEER_TIMEOUT: z.string().transform(Number).default('30000'),
  
  // Security
  BCRYPT_ROUNDS: z.string().transform(Number).default('12'),
  RATE_LIMIT_WINDOW: z.string().transform(Number).default('900000'), // 15 minutes
  RATE_LIMIT_MAX: z.string().transform(Number).default('1000'),
  
  // Monitoring
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FORMAT: z.enum(['json', 'simple']).default('json'),
  
  // Deployment
  DEPLOY_KEY_PATH: z.string().optional(),
  DEPLOY_HOST: z.string().optional(),
  DEPLOY_USER: z.string().optional(),
  DEPLOY_PATH: z.string().optional(),
});

const env = envSchema.parse(process.env);

export const config = {
  node: {
    env: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    isDevelopment: env.NODE_ENV === 'development',
    isTest: env.NODE_ENV === 'test',
  },
  server: {
    port: env.PORT,
  },
  database: {
    url: env.DATABASE_URL,
  },
  redis: {
    url: env.REDIS_URL,
  },
  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
  },
  frontend: {
    url: env.FRONTEND_URL,
  },
  email: {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
  sms: {
    accountSid: env.TWILIO_ACCOUNT_SID,
    authToken: env.TWILIO_AUTH_TOKEN,
    phoneNumber: env.TWILIO_PHONE_NUMBER,
  },
  upload: {
    maxSize: env.UPLOAD_MAX_SIZE,
    allowedTypes: env.UPLOAD_ALLOWED_TYPES.split(','),
  },
  qrCode: {
    errorCorrection: env.QR_CODE_ERROR_CORRECTION,
    size: env.QR_CODE_SIZE,
  },
  voice: {
    apiKey: env.VOICE_API_KEY,
    model: env.VOICE_MODEL,
  },
  puppeteer: {
    headless: env.PUPPETEER_HEADLESS,
    timeout: env.PUPPETEER_TIMEOUT,
  },
  security: {
    bcryptRounds: env.BCRYPT_ROUNDS,
    rateLimitWindow: env.RATE_LIMIT_WINDOW,
    rateLimitMax: env.RATE_LIMIT_MAX,
  },
  logging: {
    level: env.LOG_LEVEL,
    format: env.LOG_FORMAT,
  },
  deploy: {
    keyPath: env.DEPLOY_KEY_PATH,
    host: env.DEPLOY_HOST,
    user: env.DEPLOY_USER,
    path: env.DEPLOY_PATH,
  },
};