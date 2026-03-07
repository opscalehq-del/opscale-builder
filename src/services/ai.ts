import { env } from '../config/env.js';

export interface RunStep {
  name: string;
  action: 'analyze' | 'generate_files' | 'test' | 'package';
  instructions: string;
}

export interface BuildPlan {
  summary: string;
  steps: RunStep[];
}

export async function createBuildPlan(prompt: string): Promise<BuildPlan> {
  if (!env.OPENAI_API_KEY) {
    return {
      summary: 'Fallback plan (no OPENAI_API_KEY configured).',
      steps: [
        { name: 'Requirements extraction', action: 'analyze', instructions: `Extract requirements from: ${prompt}` },
        { name: 'Generate backend structure', action: 'generate_files', instructions: 'Create API, domain, persistence, auth, and orchestration modules.' },
        { name: 'Create validation tests', action: 'test', instructions: 'Add smoke tests and contract checks for key endpoints.' },
        { name: 'Prepare release artifact', action: 'package', instructions: 'Write handoff README and deployment instructions.' }
      ]
    };
  }

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL,
      input: `Return strict JSON with {summary:string,steps:[{name:string,action:'analyze'|'generate_files'|'test'|'package',instructions:string}]}. Prompt: ${prompt}`,
      text: {
        format: {
          type: 'json_schema',
          name: 'build_plan',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              summary: { type: 'string' },
              steps: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    name: { type: 'string' },
                    action: { type: 'string', enum: ['analyze', 'generate_files', 'test', 'package'] },
                    instructions: { type: 'string' }
                  },
                  required: ['name', 'action', 'instructions']
                }
              }
            },
            required: ['summary', 'steps']
          }
        }
      }
    })
  });

  if (!res.ok) {
    throw new Error(`Failed to generate build plan: HTTP ${res.status}`);
  }

  const data = (await res.json()) as { output_text?: string };
  if (!data.output_text) throw new Error('Missing output_text from AI response');
  return JSON.parse(data.output_text) as BuildPlan;
}
