export const CHATGPT_CODEX_PROVIDER_NAME = 'ChatGPT Codex';

const PROVIDER_NAME_ALIASES: Record<string, string> = {
  Codex: CHATGPT_CODEX_PROVIDER_NAME,
};

const PREFERRED_PROVIDER_ORDER = [CHATGPT_CODEX_PROVIDER_NAME];

export function normalizeProviderName(name?: string | null) {
  if (!name) {
    return undefined;
  }

  return PROVIDER_NAME_ALIASES[name] || name;
}

export function isChatGPTCodexProvider(name?: string | null) {
  return normalizeProviderName(name) === CHATGPT_CODEX_PROVIDER_NAME;
}

export function normalizeProviderRecordKeys<T>(record?: Record<string, T> | null): Record<string, T> {
  if (!record) {
    return {};
  }

  const normalized: Record<string, T> = {};

  for (const [key, value] of Object.entries(record)) {
    const normalizedKey = normalizeProviderName(key) || key;

    if (normalizedKey !== key && normalized[normalizedKey] !== undefined) {
      continue;
    }

    normalized[normalizedKey] = value;
  }

  return normalized;
}

function getProviderPriority(name: string) {
  const normalizedName = normalizeProviderName(name) || name;
  const priority = PREFERRED_PROVIDER_ORDER.indexOf(normalizedName);

  return priority === -1 ? Number.MAX_SAFE_INTEGER : priority;
}

export function sortProvidersByPriority<T extends { name: string }>(providers: T[]) {
  return [...providers].sort((a, b) => {
    const priorityDifference = getProviderPriority(a.name) - getProviderPriority(b.name);

    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    const left = normalizeProviderName(a.name) || a.name;
    const right = normalizeProviderName(b.name) || b.name;

    return left.localeCompare(right);
  });
}
