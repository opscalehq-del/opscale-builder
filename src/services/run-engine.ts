import { EventEmitter } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { customAlphabet } from 'nanoid';
import { db } from '../lib/db.js';
import { nowIso } from '../lib/utils.js';
import type { BuildPlan } from './ai.js';
import type { RunStatus } from '../types/models.js';

const nanoid = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyz', 16);

const runEvents = new EventEmitter();
let workerStarted = false;

function setRunStatus(runId: string, status: RunStatus, errorMessage?: string | null) {
  const isDone = status === 'succeeded' || status === 'failed' || status === 'cancelled';
  db.prepare(
    `UPDATE app_runs
     SET status = ?,
         started_at = COALESCE(started_at, ?),
         finished_at = CASE WHEN ? THEN ? ELSE finished_at END,
         error_message = ?
     WHERE id = ?`
  ).run(status, nowIso(), isDone ? 1 : 0, isDone ? nowIso() : null, errorMessage ?? null, runId);
}

export function appendRunLog(runId: string, level: 'info' | 'error' | 'debug', message: string) {
  const created = nowIso();
  db.prepare('INSERT INTO app_run_logs (run_id, level, message, created_at) VALUES (?, ?, ?, ?)')
    .run(runId, level, message, created);
  runEvents.emit(`log:${runId}`, { level, message, created_at: created });
}

function persistArtifact(runId: string, artifactType: string, relPath: string, content: string) {
  db.prepare('INSERT INTO run_artifacts (id, run_id, artifact_type, path, content, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(nanoid(), runId, artifactType, relPath, content, nowIso());
}

async function executeRun(runId: string, projectId: string, prompt: string, plan: BuildPlan) {
  setRunStatus(runId, 'running');
  appendRunLog(runId, 'info', `Run started for project ${projectId}`);
  appendRunLog(runId, 'debug', `Prompt: ${prompt}`);

  try {
    for (const [index, step] of plan.steps.entries()) {
      appendRunLog(runId, 'info', `Step ${index + 1}/${plan.steps.length}: ${step.name}`);
      appendRunLog(runId, 'debug', `${step.action}: ${step.instructions}`);
      await delay(500);

      if (step.action === 'generate_files') {
        const fileBody = JSON.stringify(
          {
            generated_from_run: runId,
            objective: prompt,
            generated_at: nowIso(),
            notes: 'Replace this generated scaffold content with concrete source implementation files.'
          },
          null,
          2
        );
        persistArtifact(runId, 'file', 'generated/scaffold.json', fileBody);
        appendRunLog(runId, 'info', 'Artifact generated: generated/scaffold.json');
      }

      if (step.action === 'test') {
        appendRunLog(runId, 'info', 'Executed simulated validation suite: all checks passed.');
      }
    }

    persistArtifact(runId, 'report', 'reports/summary.md', `# Build Summary\n\n${plan.summary}\n`);
    setRunStatus(runId, 'succeeded');
    appendRunLog(runId, 'info', 'Run completed successfully.');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    setRunStatus(runId, 'failed', message);
    appendRunLog(runId, 'error', `Run failed: ${message}`);
  }
}

function processNextQueuedRun() {
  const run = db.prepare(
    `SELECT id, project_id, prompt, plan_json
     FROM app_runs
     WHERE status = 'queued'
     ORDER BY created_at ASC
     LIMIT 1`
  ).get() as { id: string; project_id: string; prompt: string; plan_json: string } | undefined;

  if (!run) return;
  const plan = JSON.parse(run.plan_json) as BuildPlan;
  void executeRun(run.id, run.project_id, run.prompt, plan);
}

export function startRunWorker() {
  if (workerStarted) return;
  workerStarted = true;
  setInterval(processNextQueuedRun, 750);
}

export function subscribeRunLogs(runId: string, cb: (event: { level: string; message: string; created_at: string }) => void) {
  const eventName = `log:${runId}`;
  runEvents.on(eventName, cb);
  return () => runEvents.off(eventName, cb);
}
