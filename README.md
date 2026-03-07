# Orchids-like Backend Builder System

This backend is a production-style foundation for building an Orchids-like AI app builder platform.

## Stack
- Fastify + TypeScript
- SQLite (`better-sqlite3`) for persistence
- JWT auth
- AI planning via OpenAI Responses API (fallback planner if key missing)
- In-process run worker with persistent run/log/artifact records
- SSE streaming for run logs

## Quick Start
```bash
cp .env.example .env
npm install
npm run dev
```

API base URL: `http://localhost:4000/v1`
Swagger docs: `http://localhost:4000/docs`

## Core Capabilities
- User auth: register/login/me
- Multi-project management
- In-project file storage APIs
- Agent definitions (role/prompt/tools)
- App run orchestration:
  - Create run from prompt
  - AI-generated execution plan
  - Queue + worker execution lifecycle
  - Persistent logs and artifacts
  - Run cancellation
  - SSE live log streaming

## Primary Endpoints
- `POST /v1/auth/register`
- `POST /v1/auth/login`
- `GET /v1/auth/me`
- `GET/POST/PATCH/DELETE /v1/projects`
- `GET/PUT/DELETE /v1/projects/:projectId/files...`
- `GET/POST/PATCH/DELETE /v1/projects/:projectId/agents...`
- `POST /v1/projects/:projectId/runs`
- `GET /v1/projects/:projectId/runs`
- `GET /v1/projects/:projectId/runs/:runId`
- `POST /v1/projects/:projectId/runs/:runId/cancel`
- `GET /v1/runs/:runId/logs/stream`
- `GET /v1/runs/:runId/artifacts`

## Environment
See `.env.example`.

If `OPENAI_API_KEY` is absent, run planning uses a local fallback planner.

## Extend Next
- Replace simple password hashing with Argon2/Bcrypt
- Add API keys + team/workspace RBAC
- Move worker to separate process and queue backend (Redis/SQS)
- Add git integration and deployment pipelines
- Add policy sandbox for tool execution
