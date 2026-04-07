export const CODEX_REASONING_EFFORTS = ['low', 'medium', 'high', 'xhigh'] as const;

export type CodexReasoningEffort = (typeof CODEX_REASONING_EFFORTS)[number];

export const DEFAULT_CODEX_REASONING_EFFORT: CodexReasoningEffort = 'medium';

export const CODEX_REASONING_EFFORT_LABELS: Record<CodexReasoningEffort, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra High',
};

const XHIGH_REASONING_MODELS = new Set(['gpt-5.4', 'gpt-5.3-codex', 'gpt-5.2-codex', 'gpt-5.1-codex-max']);

export function normalizeCodexReasoningEffort(value?: string): CodexReasoningEffort {
  if (value && CODEX_REASONING_EFFORTS.includes(value as CodexReasoningEffort)) {
    return value as CodexReasoningEffort;
  }

  return DEFAULT_CODEX_REASONING_EFFORT;
}

export function resolveCodexReasoningEffort(modelId: string, requestedEffort?: string): CodexReasoningEffort {
  const normalizedEffort = normalizeCodexReasoningEffort(requestedEffort);

  if (normalizedEffort !== 'xhigh') {
    return normalizedEffort;
  }

  return XHIGH_REASONING_MODELS.has(modelId) ? normalizedEffort : 'high';
}
