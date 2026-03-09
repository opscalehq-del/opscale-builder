import { customAlphabet } from 'nanoid';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { nowIso } from '../lib/utils.js';
import { createBuildPlan } from '../services/ai.js';
import { appendRunLog, subscribeRunLogs } from '../services/run-engine.js';

const nanoid = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyz', 16);

const CreateRunSchema = z.object({
  prompt: z.string().min(3).max(20000)
});

function assertProject(projectId: string, userId: string): boolean {
  return !!db.prepare('SELECT 1 FROM projects WHERE id = ? AND user_id = ?').get(projectId, userId);
}

export async function runRoutes(app: FastifyInstance) {
  app.post('/projects/:projectId/runs', { preHandler: app.authenticate }, async (req, reply) => {
    const parsed = CreateRunSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() });

    const userId = (req.user as { sub: string }).sub;
    const { projectId } = req.params as { projectId: string };
    if (!assertProject(projectId, userId)) return reply.notFound('Project not found');

    const plan = await createBuildPlan(parsed.data.prompt);
    const run = {
      id: nanoid(),
      project_id: projectId,
      requested_by: userId,
      prompt: parsed.data.prompt,
      plan_json: JSON.stringify(plan),
      status: 'queued',
      created_at: nowIso()
    };

    db.prepare(
      'INSERT INTO app_runs (id, project_id, requested_by, prompt, plan_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(run.id, run.project_id, run.requested_by, run.prompt, run.plan_json, run.status, run.created_at);

    appendRunLog(run.id, 'info', 'Run queued and waiting for worker pickup.');
    return reply.code(201).send({ run: { ...run, plan: plan } });
  });

  app.get('/projects/:projectId/runs', { preHandler: app.authenticate }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub;
    const { projectId } = req.params as { projectId: string };
    if (!assertProject(projectId, userId)) return reply.notFound('Project not found');

    const runs = db.prepare('SELECT * FROM app_runs WHERE project_id = ? ORDER BY created_at DESC').all(projectId);
    return { runs };
  });

  app.get('/projects/:projectId/runs/:runId', { preHandler: app.authenticate }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub;
    const { projectId, runId } = req.params as { projectId: string; runId: string };
    if (!assertProject(projectId, userId)) return reply.notFound('Project not found');

    const run = db.prepare('SELECT * FROM app_runs WHERE id = ? AND project_id = ?').get(runId, projectId);
    if (!run) return reply.notFound('Run not found');

    const logs = db.prepare('SELECT level, message, created_at FROM app_run_logs WHERE run_id = ? ORDER BY id ASC').all(runId);
    const artifacts = db
      .prepare('SELECT id, artifact_type, path, created_at FROM run_artifacts WHERE run_id = ? ORDER BY created_at ASC')
      .all(runId);
    return { run, logs, artifacts };
  });

  app.post('/projects/:projectId/runs/:runId/cancel', { preHandler: app.authenticate }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub;
    const { projectId, runId } = req.params as { projectId: string; runId: string };
    if (!assertProject(projectId, userId)) return reply.notFound('Project not found');

    const run = db.prepare('SELECT status FROM app_runs WHERE id = ? AND project_id = ?').get(runId, projectId) as
      | { status: string }
      | undefined;
    if (!run) return reply.notFound('Run not found');

    if (run.status === 'succeeded' || run.status === 'failed' || run.status === 'cancelled') {
      return reply.badRequest(`Run already finalized with status ${run.status}`);
    }

    db.prepare('UPDATE app_runs SET status = ?, finished_at = ? WHERE id = ?').run('cancelled', nowIso(), runId);
    appendRunLog(runId, 'info', 'Run cancelled by user.');

    return { ok: true };
  });

  app.get('/runs/:runId/logs/stream', { preHandler: app.authenticate }, async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const runExists = db.prepare('SELECT 1 FROM app_runs WHERE id = ?').get(runId);
    if (!runExists) return reply.notFound('Run not found');

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.write(': connected\n\n');

    const historical = db
      .prepare('SELECT level, message, created_at FROM app_run_logs WHERE run_id = ? ORDER BY id ASC LIMIT 200')
      .all(runId) as Array<{ level: string; message: string; created_at: string }>;

    for (const log of historical) {
      reply.raw.write(`data: ${JSON.stringify(log)}\n\n`);
    }

    const unsubscribe = subscribeRunLogs(runId, (event) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    const ping = setInterval(() => {
      reply.raw.write(': ping\n\n');
    }, 15_000);

    req.raw.on('close', () => {
      clearInterval(ping);
      unsubscribe();
      reply.raw.end();
    });
  });

  app.get('/runs/:runId/artifacts', { preHandler: app.authenticate }, async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const run = db.prepare('SELECT * FROM app_runs WHERE id = ?').get(runId);
    if (!run) return reply.notFound('Run not found');

    const artifacts = db.prepare('SELECT * FROM run_artifacts WHERE run_id = ? ORDER BY created_at ASC').all(runId);
    return { artifacts };
  });
}
