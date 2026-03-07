import { customAlphabet } from 'nanoid';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { hashPassword, nowIso, verifyPassword } from '../lib/utils.js';

const nanoid = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyz', 16);

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const LoginSchema = RegisterSchema;

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/register', async (req, reply) => {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() });

    const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(parsed.data.email);
    if (exists) return reply.conflict('Email already registered');

    const user = {
      id: nanoid(),
      email: parsed.data.email,
      password_hash: hashPassword(parsed.data.password),
      created_at: nowIso()
    };

    db.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run(user.id, user.email, user.password_hash, user.created_at);

    const token = await reply.jwtSign({ sub: user.id, email: user.email });
    return reply.code(201).send({ token, user: { id: user.id, email: user.email } });
  });

  app.post('/auth/login', async (req, reply) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() });

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(parsed.data.email) as
      | { id: string; email: string; password_hash: string }
      | undefined;
    if (!user || !verifyPassword(parsed.data.password, user.password_hash)) {
      return reply.unauthorized('Invalid credentials');
    }

    const token = await reply.jwtSign({ sub: user.id, email: user.email });
    return { token, user: { id: user.id, email: user.email } };
  });

  app.get('/auth/me', { preHandler: app.authenticate }, async (req) => {
    const userId = (req.user as { sub: string }).sub;
    const user = db.prepare('SELECT id, email, created_at FROM users WHERE id = ?').get(userId);
    return { user };
  });
}
