import { customAlphabet } from 'nanoid';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { nowIso } from '../lib/utils.js';

const nanoid = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyz', 16);

const AgentSchema = z.object({
  name: z.string().min(1).max(120),
  role: z.string().min(1).max(120),
  systemPrompt: z.string().min(1).max(10000),
  tools: z.array(z.string()).default([])
});

function ownsProject(projectId: string, userId: string): boolean {
  return !!db.prepare('SELECT 1 FROM projects WHERE id = ? AND user_id = ?').get(projectId, userId);
}

export async function agentRoutes(app: FastifyInstance) {
  app.get('/projects/:projectId/agents', { preHandler: app.authenticate }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub;
    const { projectId } = req.params as { projectId: string };
    if (!ownsProject(projectId, userId)) return reply.notFound('Project not found');

    const agents = db.prepare('SELECT * FROM agents WHERE project_id = ? ORDER BY updated_at DESC').all(projectId);
    return { agents };
  });

  app.post('/projects/:projectId/agents', { preHandler: app.authenticate }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub;
    const { projectId } = req.params as { projectId: string };
    if (!ownsProject(projectId, userId)) return reply.notFound('Project not found');

    const parsed = AgentSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() });

    const now = nowIso();
    const agent = {
      id: nanoid(),
      project_id: projectId,
      name: parsed.data.name,
      role: parsed.data.role,
      system_prompt: parsed.data.systemPrompt,
      tools_json: JSON.stringify(parsed.data.tools),
      created_at: now,
      updated_at: now
    };

    db.prepare(
      'INSERT INTO agents (id, project_id, name, role, system_prompt, tools_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      agent.id,
      agent.project_id,
      agent.name,
      agent.role,
      agent.system_prompt,
      agent.tools_json,
      agent.created_at,
      agent.updated_at
    );

    return reply.code(201).send({ agent });
  });

  app.patch('/projects/:projectId/agents/:agentId', { preHandler: app.authenticate }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub;
    const { projectId, agentId } = req.params as { projectId: string; agentId: string };
    if (!ownsProject(projectId, userId)) return reply.notFound('Project not found');

    const parsed = AgentSchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() });

    const current = db.prepare('SELECT * FROM agents WHERE id = ? AND project_id = ?').get(agentId, projectId) as
      | { name: string; role: string; system_prompt: string; tools_json: string }
      | undefined;
    if (!current) return reply.notFound('Agent not found');

    db.prepare(
      'UPDATE agents SET name = ?, role = ?, system_prompt = ?, tools_json = ?, updated_at = ? WHERE id = ? AND project_id = ?'
    ).run(
      parsed.data.name ?? current.name,
      parsed.data.role ?? current.role,
      parsed.data.systemPrompt ?? current.system_prompt,
      parsed.data.tools ? JSON.stringify(parsed.data.tools) : current.tools_json,
      nowIso(),
      agentId,
      projectId
    );

    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId);
    return { agent };
  });

  app.delete('/projects/:projectId/agents/:agentId', { preHandler: app.authenticate }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub;
    const { projectId, agentId } = req.params as { projectId: string; agentId: string };
    if (!ownsProject(projectId, userId)) return reply.notFound('Project not found');

    const result = db.prepare('DELETE FROM agents WHERE id = ? AND project_id = ?').run(agentId, projectId);
    if (!result.changes) return reply.notFound('Agent not found');
    return reply.code(204).send();
  });
}
