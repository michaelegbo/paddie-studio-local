const CODEX_AUTH_PROXY_BASE_URL = 'http://127.0.0.1:1456';

export type CodexAuthStatus = {
  available: boolean;
  authenticated: boolean;
  requiresElectron: boolean;
  accountId?: string;
  email?: string;
  message?: string;
};

async function fetchWithTimeout(path: string, init?: RequestInit, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(`${CODEX_AUTH_PROXY_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return (await response.json()) as T;
  }

  const message = await response.text().catch(() => '');
  throw new Error(message || `Codex auth request failed with status ${response.status}`);
}

export async function getCodexAuthStatus(): Promise<CodexAuthStatus> {
  try {
    const response = await fetchWithTimeout('/auth/status');

    if (!response.ok) {
      const message = await response.text().catch(() => '');

      return {
        available: false,
        authenticated: false,
        requiresElectron: true,
        message: message || `Codex auth status failed with ${response.status}`,
      };
    }

    return await parseJsonResponse<CodexAuthStatus>(response);
  } catch {
    return {
      available: false,
      authenticated: false,
      requiresElectron: true,
      message: 'Codex auth is only available in the Electron app.',
    };
  }
}

export async function runCodexAuthAction(action: 'login' | 'logout') {
  const timeoutMs = action === 'login' ? 10 * 60 * 1000 : 5000;
  const response = await fetchWithTimeout(
    `/auth/${action}`,
    {
      method: 'POST',
    },
    timeoutMs,
  );

  if (!response.ok) {
    const data = await parseJsonResponse<CodexAuthStatus>(response);
    throw new Error(data.message || `Codex auth ${action} failed`);
  }

  return await parseJsonResponse<CodexAuthStatus>(response);
}
