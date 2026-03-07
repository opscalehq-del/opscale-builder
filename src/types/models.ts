export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Agent {
  id: string;
  project_id: string;
  name: string;
  role: string;
  system_prompt: string;
  tools_json: string;
  created_at: string;
  updated_at: string;
}

export interface AppRun {
  id: string;
  project_id: string;
  requested_by: string;
  prompt: string;
  plan_json: string;
  status: RunStatus;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
  created_at: string;
}
