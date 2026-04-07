import http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { shell } from 'electron';
import { store } from './store';

const CODEX_AUTH_PROXY_PORT = 1456;
const OAUTH_CALLBACK_PORT = 1455;
const STORE_KEY = 'auth:codex';
const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const AUTHORIZE_URL = 'https://auth.openai.com/oauth/authorize';
const TOKEN_URL = 'https://auth.openai.com/oauth/token';
const REDIRECT_URI = `http://localhost:${OAUTH_CALLBACK_PORT}/auth/callback`;
const SCOPE = 'openid profile email offline_access api.connectors.read api.connectors.invoke';
const CODEX_RESPONSES_URL = 'https://chatgpt.com/backend-api/codex/responses';

type StoredCodexAuth = {
  access: string;
  refresh: string;
  expires: number;
  accountId?: string;
  email?: string;
};

type CodexAuthStatus = {
  available: boolean;
  authenticated: boolean;
  requiresElectron: boolean;
  accountId?: string;
  email?: string;
  message?: string;
};

let proxyServer: http.Server | null = null;
let activeLogin: Promise<CodexAuthStatus> | null = null;

function base64UrlEncode(value: Buffer) {
  return value.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function createPkcePair() {
  const verifier = base64UrlEncode(randomBytes(32));
  const challenge = base64UrlEncode(createHash('sha256').update(verifier).digest());

  return { verifier, challenge };
}

function decodeJwt(token: string) {
  try {
    const parts = token.split('.');

    if (parts.length !== 3) {
      return null;
    }

    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const payload = Buffer.from(padded, 'base64').toString('utf8');

    return JSON.parse(payload) as {
      email?: string;
      'https://api.openai.com/auth'?: {
        chatgpt_account_id?: string;
      };
    };
  } catch {
    return null;
  }
}

function readStoredAuth() {
  return store.get(STORE_KEY) as StoredCodexAuth | undefined;
}

function writeStoredAuth(auth: StoredCodexAuth) {
  store.set(STORE_KEY, auth);
}

function clearStoredAuth() {
  store.delete(STORE_KEY);
}

function buildStatus(message?: string): CodexAuthStatus {
  const auth = readStoredAuth();

  return {
    available: true,
    authenticated: !!auth?.access,
    requiresElectron: true,
    accountId: auth?.accountId,
    email: auth?.email,
    message,
  };
}

async function exchangeToken(params: URLSearchParams) {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(message || `Token exchange failed with status ${response.status}`);
  }

  const json = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!json.access_token || !json.refresh_token || typeof json.expires_in !== 'number') {
    throw new Error('OpenAI auth response was missing required token fields');
  }

  const decoded = decodeJwt(json.access_token);

  const auth: StoredCodexAuth = {
    access: json.access_token,
    refresh: json.refresh_token,
    expires: Date.now() + json.expires_in * 1000,
    accountId: decoded?.['https://api.openai.com/auth']?.chatgpt_account_id,
    email: decoded?.email,
  };

  writeStoredAuth(auth);

  return auth;
}

async function refreshStoredAuth() {
  const current = readStoredAuth();

  if (!current?.refresh) {
    clearStoredAuth();
    throw new Error('Codex auth is missing. Sign in with ChatGPT.');
  }

  return await exchangeToken(
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: current.refresh,
      client_id: CLIENT_ID,
    }),
  );
}

async function ensureFreshAuth() {
  const current = readStoredAuth();

  if (!current?.access) {
    throw new Error('Codex auth is missing. Sign in with ChatGPT.');
  }

  if (current.expires > Date.now() + 60_000) {
    return current;
  }

  return await refreshStoredAuth();
}

async function waitForAuthorizationCode(expectedState: string) {
  return await new Promise<string>((resolve, reject) => {
    let settled = false;
    const callbackServer = http.createServer((req, res) => {
      try {
        const url = new URL(req.url || '', 'http://127.0.0.1');

        if (url.pathname !== '/auth/callback') {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Not found');

          return;
        }

        if (url.searchParams.get('state') !== expectedState) {
          res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('State mismatch');

          return;
        }

        const callbackError = url.searchParams.get('error');

        if (callbackError) {
          const errorDescription = url.searchParams.get('error_description');
          const message = errorDescription ? `${callbackError}: ${errorDescription}` : callbackError;

          res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end(`Authentication failed: ${message}`);
          settled = true;
          clearTimeout(timeout);
          reject(new Error(`OpenAI authentication failed: ${message}`));

          return;
        }

        const code = url.searchParams.get('code');

        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Missing authorization code');

          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h2>Authentication complete.</h2><p>You can return to bolt.diy.</p>');
        settled = true;
        clearTimeout(timeout);
        resolve(code);
      } catch (error) {
        settled = true;
        clearTimeout(timeout);
        reject(error);
      } finally {
        setTimeout(() => callbackServer.close(), 50);
      }
    });

    callbackServer.listen(OAUTH_CALLBACK_PORT, '127.0.0.1');
    callbackServer.on('error', (error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      reject(error);
    });

    const timeout = setTimeout(
      () => {
        if (settled) {
          return;
        }

        settled = true;
        callbackServer.close();
        reject(new Error('Timed out waiting for ChatGPT authentication'));
      },
      5 * 60 * 1000,
    );
  });
}

async function runLoginFlow() {
  const { verifier, challenge } = createPkcePair();
  const state = randomBytes(16).toString('hex');
  const authUrl = new URL(AUTHORIZE_URL);

  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('scope', SCOPE);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('id_token_add_organizations', 'true');
  authUrl.searchParams.set('codex_cli_simplified_flow', 'true');
  authUrl.searchParams.set('originator', 'codex_cli_rs');

  const authorizationCodePromise = waitForAuthorizationCode(state);
  await shell.openExternal(authUrl.toString());

  const code = await authorizationCodePromise;

  await exchangeToken(
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code,
      code_verifier: verifier,
      redirect_uri: REDIRECT_URI,
    }),
  );

  return buildStatus();
}

async function login() {
  if (!activeLogin) {
    activeLogin = runLoginFlow().finally(() => {
      activeLogin = null;
    });
  }

  return await activeLogin;
}

function writeJson(res: http.ServerResponse, statusCode: number, payload: unknown) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(payload));
}

async function readBody(req: http.IncomingMessage) {
  const chunks: Uint8Array[] = [];

  for await (const chunk of req) {
    const normalizedChunk = Buffer.isBuffer(chunk) ? Uint8Array.from(chunk) : Uint8Array.from(Buffer.from(chunk));
    chunks.push(normalizedChunk);
  }

  return Buffer.concat(chunks).toString('utf8');
}

async function handleResponses(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    const auth = await ensureFreshAuth();
    const requestBody = await readBody(req);

    if (!auth.accountId) {
      throw new Error('Unable to determine ChatGPT account id from the OAuth token');
    }

    let upstream = await fetch(CODEX_RESPONSES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${auth.access}`,
        'OpenAI-Beta': 'responses=experimental',
        originator: 'codex_cli_rs',
        'chatgpt-account-id': auth.accountId,
      },
      body: requestBody,
    });

    if (upstream.status === 401) {
      const refreshed = await refreshStoredAuth();

      if (!refreshed.accountId) {
        throw new Error('Unable to determine ChatGPT account id from the refreshed token');
      }

      upstream = await fetch(CODEX_RESPONSES_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          Authorization: `Bearer ${refreshed.access}`,
          'OpenAI-Beta': 'responses=experimental',
          originator: 'codex_cli_rs',
          'chatgpt-account-id': refreshed.accountId,
        },
        body: requestBody,
      });
    }

    res.writeHead(upstream.status, {
      'Content-Type': upstream.headers.get('content-type') || 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    });

    if (!upstream.body) {
      const text = await upstream.text().catch(() => '');
      res.end(text);

      return;
    }

    const reader = upstream.body.getReader();

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      res.write(Buffer.from(value));
    }

    res.end();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Codex request failed';
    writeJson(res, 401, { error: message });
  }
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url || '', `http://127.0.0.1:${CODEX_AUTH_PROXY_PORT}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    });
    res.end();

    return;
  }

  if (url.pathname === '/health' && req.method === 'GET') {
    writeJson(res, 200, { ok: true });
    return;
  }

  if (url.pathname === '/auth/status' && req.method === 'GET') {
    writeJson(res, 200, buildStatus());
    return;
  }

  if (url.pathname === '/auth/login' && req.method === 'POST') {
    try {
      const status = await login();
      writeJson(res, 200, status);
    } catch (error) {
      writeJson(res, 500, {
        ...buildStatus(),
        message: error instanceof Error ? error.message : 'Codex login failed',
      });
    }
    return;
  }

  if (url.pathname === '/auth/logout' && req.method === 'POST') {
    clearStoredAuth();
    writeJson(res, 200, buildStatus('Signed out'));

    return;
  }

  if (url.pathname === '/responses' && req.method === 'POST') {
    await handleResponses(req, res);
    return;
  }

  writeJson(res, 404, { error: 'Not found' });
}

export async function startCodexAuthServer() {
  if (proxyServer) {
    return;
  }

  proxyServer = http.createServer((req, res) => {
    void handleRequest(req, res).catch((error) => {
      writeJson(res, 500, {
        error: error instanceof Error ? error.message : 'Codex auth server error',
      });
    });
  });

  await new Promise<void>((resolve, reject) => {
    proxyServer?.listen(CODEX_AUTH_PROXY_PORT, '127.0.0.1', () => resolve());
    proxyServer?.once('error', reject);
  });
}

export async function stopCodexAuthServer() {
  if (!proxyServer) {
    return;
  }

  const current = proxyServer;
  proxyServer = null;

  await new Promise<void>((resolve, reject) => {
    current.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
