import serverless from 'serverless-http';
import { buildApp } from '../../src/app.js';

// The module is cached between warm invocations, so this runs only on cold starts.
const app = buildApp();
await app.ready();

// Note: The SSE streaming endpoint (/runs/:runId/logs/stream) requires a
// persistent connection and is not supported in Netlify Functions due to the
// 10-second execution timeout. All other REST endpoints work as expected.
export const handler = serverless(app);
