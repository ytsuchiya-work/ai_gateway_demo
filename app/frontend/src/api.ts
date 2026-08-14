export type Mode = "nogw" | "withgw";

export interface Governance {
  enabled: boolean;
  safety_verdict?: string;
  blocked?: boolean;
  pii_input_masked?: boolean;
  pii_output_masked?: boolean;
  masked_input?: string;
  action?: string;
  logged?: boolean;
  request_id?: string | null;
}

export interface ChatResp {
  mode: Mode;
  endpoint?: string;
  response?: string;
  rate_limited: boolean;
  governance?: Governance;
  metrics?: { input_tokens: number; output_tokens: number; latency_ms: number };
}

export interface Prompt {
  id: string;
  category: string;
  label: string;
  text: string;
}

export interface AuditRow {
  request_id: string;
  ts: string;
  mode: string;
  endpoint: string;
  user_input: string;
  masked_input: string;
  safety_verdict: string;
  action: string;
  model_output: string;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

async function get<T>(path: string): Promise<T> {
  const r = await fetch(path);
  return r.json();
}

export const api = {
  chat: (mode: Mode, message: string) => post<ChatResp>("/api/chat", { mode, message }),
  prompts: () => get<Prompt[]>("/api/prompts"),
  config: () => get<any>("/api/config"),
  audit: () => get<{ summary: { withgw: number; nogw: number }; rows: AuditRow[] }>("/api/audit"),
  rateTest: (mode: Mode, count: number) =>
    post<any>("/api/ratelimit-test", { mode, count }),
};
