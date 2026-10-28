import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  /** Public origin of the site (used for CORS and the CSRF origin check). */
  CLIENT_ORIGIN: z.string().url().default('http://localhost:4000'),
  /** Folder with the static frontend that Express serves at /. */
  FRONTEND_DIR: z.string().default('../frontend'),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  /** Groq API key for the AI patient chat feature. Optional — omit to disable AI responses. */
  GROQ_API_KEY: z.string().min(1).optional(),
});

export type Config = z.infer<typeof schema> & { cookieSecure: boolean };

/** Reads and validates the environment once at start-up. Fails fast with a readable message. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  const cfg = parsed.data;
  if (cfg.COOKIE_SAMESITE === 'none' && cfg.NODE_ENV === 'production' && !cfg.CLIENT_ORIGIN.startsWith('https://')) {
    throw new Error('COOKIE_SAMESITE=none requires an https CLIENT_ORIGIN.');
  }
  return {
    ...cfg,
    // Secure cookies in production, and whenever SameSite=None (browsers require it).
    cookieSecure: cfg.NODE_ENV === 'production' || cfg.COOKIE_SAMESITE === 'none',
  };
}
