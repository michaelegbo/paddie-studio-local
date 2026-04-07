import React, { useState, useEffect, useCallback } from 'react';
import { IconButton } from '~/components/ui/IconButton';
import type { ProviderInfo } from '~/types/model';
import Cookies from 'js-cookie';
import { useSettings } from '~/lib/hooks/useSettings';
import {
  CODEX_REASONING_EFFORT_LABELS,
  CODEX_REASONING_EFFORTS,
  normalizeCodexReasoningEffort,
} from '~/lib/modules/llm/providers/codex-config';
import { isChatGPTCodexProvider, normalizeProviderRecordKeys } from '~/lib/modules/llm/provider-utils';
import { classNames } from '~/utils/classNames';

interface APIKeyManagerProps {
  provider: ProviderInfo;
  apiKey: string;
  setApiKey: (key: string) => void;
  getApiKeyLink?: string;
  labelForGetApiKey?: string;
}

interface OAuthStatus {
  available: boolean;
  authenticated: boolean;
  requiresElectron: boolean;
  accountId?: string;
  email?: string;
  message?: string;
}

// cache which stores whether the provider's API key is set via environment variable
const providerEnvKeyStatusCache: Record<string, boolean> = {};
const providerOauthStatusCache: Record<string, OAuthStatus> = {};

const apiKeyMemoizeCache: { [k: string]: Record<string, string> } = {};

export function getApiKeysFromCookies() {
  const storedApiKeys = Cookies.get('apiKeys');
  let parsedKeys: Record<string, string> = {};

  if (storedApiKeys) {
    parsedKeys = apiKeyMemoizeCache[storedApiKeys];

    if (!parsedKeys) {
      parsedKeys = apiKeyMemoizeCache[storedApiKeys] = JSON.parse(storedApiKeys);
    }
  }

  return normalizeProviderRecordKeys(parsedKeys);
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export const APIKeyManager: React.FC<APIKeyManagerProps> = ({ provider, apiKey, setApiKey }) => {
  const { providers, updateProviderSettings } = useSettings();
  const [isEditing, setIsEditing] = useState(false);
  const [tempKey, setTempKey] = useState(apiKey);
  const [isEnvKeySet, setIsEnvKeySet] = useState(false);
  const [oauthStatus, setOauthStatus] = useState<OAuthStatus>();
  const [isOAuthLoading, setIsOAuthLoading] = useState(false);
  const isChatGPTCodex = isChatGPTCodexProvider(provider.name);
  const selectedReasoningEffort = normalizeCodexReasoningEffort(providers[provider.name]?.settings?.reasoningEffort);

  // Reset states and load saved key when provider changes
  useEffect(() => {
    // Load saved API key from cookies for this provider
    const savedKeys = getApiKeysFromCookies();
    const savedKey = savedKeys[provider.name] || '';

    setTempKey(savedKey);
    setIsEditing(false);
  }, [provider.name]);

  const checkEnvApiKey = useCallback(async () => {
    if (provider.authType === 'oauth') {
      return;
    }

    // Check cache first
    if (providerEnvKeyStatusCache[provider.name] !== undefined) {
      setIsEnvKeySet(providerEnvKeyStatusCache[provider.name]);
      return;
    }

    try {
      const response = await fetch(`/api/check-env-key?provider=${encodeURIComponent(provider.name)}`);
      const data = await response.json();
      const isSet = (data as { isSet: boolean }).isSet;

      // Cache the result
      providerEnvKeyStatusCache[provider.name] = isSet;
      setIsEnvKeySet(isSet);
    } catch (error) {
      console.error('Failed to check environment API key:', error);
      setIsEnvKeySet(false);
    }
  }, [provider.authType, provider.name]);

  const checkOAuthStatus = useCallback(
    async (force = false) => {
      if (provider.authType !== 'oauth' || !provider.authApiPath) {
        return;
      }

      if (!force && providerOauthStatusCache[provider.name]) {
        setOauthStatus(providerOauthStatusCache[provider.name]);
        return;
      }

      setIsOAuthLoading(true);

      try {
        const response = await fetch(provider.authApiPath);
        const data = (await response.json()) as OAuthStatus;

        providerOauthStatusCache[provider.name] = data;
        setOauthStatus(data);
      } catch {
        const unavailableStatus: OAuthStatus = {
          available: false,
          authenticated: false,
          requiresElectron: !!provider.requiresElectron,
          message: 'This provider is only available in the Electron app.',
        };

        providerOauthStatusCache[provider.name] = unavailableStatus;
        setOauthStatus(unavailableStatus);
      } finally {
        setIsOAuthLoading(false);
      }
    },
    [provider.authApiPath, provider.authType, provider.name, provider.requiresElectron],
  );

  useEffect(() => {
    if (provider.authType === 'oauth') {
      void checkOAuthStatus();
      return;
    }

    void checkEnvApiKey();
  }, [checkEnvApiKey, checkOAuthStatus, provider.authType]);

  const handleSave = () => {
    // Save to parent state
    setApiKey(tempKey);

    // Save to cookies
    const currentKeys = getApiKeysFromCookies();
    const newKeys = { ...currentKeys, [provider.name]: tempKey };
    Cookies.set('apiKeys', JSON.stringify(newKeys));

    setIsEditing(false);
  };

  const handleOAuthAction = useCallback(
    async (action: 'login' | 'logout') => {
      if (!provider.authApiPath) {
        return;
      }

      setIsOAuthLoading(true);

      try {
        const response = await fetch(provider.authApiPath, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action }),
        });

        const data = (await response.json()) as OAuthStatus & { error?: string };

        if (!response.ok) {
          throw new Error(data.error || data.message || 'Authentication request failed');
        }

        providerOauthStatusCache[provider.name] = data;
        setOauthStatus(data);
      } catch (error) {
        setOauthStatus((prev) => ({
          available: prev?.available ?? false,
          authenticated: false,
          requiresElectron: prev?.requiresElectron ?? !!provider.requiresElectron,
          message: error instanceof Error ? error.message : 'Authentication request failed',
        }));
      } finally {
        setIsOAuthLoading(false);
      }
    },
    [provider.authApiPath, provider.name, provider.requiresElectron],
  );

  const handleReasoningEffortChange = useCallback(
    (reasoningEffort: string) => {
      const currentProvider = providers[provider.name];

      if (!currentProvider) {
        return;
      }

      updateProviderSettings(provider.name, {
        ...currentProvider.settings,
        reasoningEffort: normalizeCodexReasoningEffort(reasoningEffort),
      });
    },
    [provider.name, providers, updateProviderSettings],
  );

  const reasoningEffortControl = isChatGPTCodex ? (
    <div className="flex items-center justify-between gap-3 border-t border-bolt-elements-borderColor pt-3 mt-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-bolt-elements-textSecondary">Reasoning Effort</div>
        <div className="text-xs text-bolt-elements-textTertiary">
          Low, Medium, High, or Extra High. Extra High falls back to High on older Codex models.
        </div>
      </div>
      <select
        value={selectedReasoningEffort}
        onChange={(event) => handleReasoningEffortChange(event.target.value)}
        className={classNames(
          'min-w-[140px] px-3 py-2 rounded-lg text-sm',
          'bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor',
          'text-bolt-elements-textPrimary',
          'focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus',
          'transition-all duration-200',
        )}
        aria-label="ChatGPT Codex reasoning effort"
      >
        {CODEX_REASONING_EFFORTS.map((effort) => (
          <option key={effort} value={effort}>
            {CODEX_REASONING_EFFORT_LABELS[effort]}
          </option>
        ))}
      </select>
    </div>
  ) : null;

  if (provider.authType === 'oauth') {
    const statusLabel = oauthStatus?.authenticated
      ? oauthStatus.email
        ? `Signed in as ${oauthStatus.email}`
        : 'Signed in with ChatGPT'
      : oauthStatus?.message || 'Not connected';

    return (
      <div className="py-3 px-1">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-bolt-elements-textSecondary">{provider?.name} Sign-in:</span>
              <div className="flex items-center gap-2">
                {oauthStatus?.authenticated ? (
                  <>
                    <div className="i-ph:check-circle-fill text-green-500 w-4 h-4" />
                    <span className="text-xs text-green-500">{statusLabel}</span>
                  </>
                ) : (
                  <>
                    <div className="i-ph:x-circle-fill text-red-500 w-4 h-4" />
                    <span className="text-xs text-red-500">{statusLabel}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isOAuthLoading ? (
              <div className="i-svg-spinners:90-ring-with-bg text-bolt-elements-loader-progress text-xl animate-spin" />
            ) : oauthStatus?.authenticated ? (
              <IconButton
                onClick={() => void handleOAuthAction('logout')}
                title="Sign out"
                className="bg-red-500/10 hover:bg-red-500/20 text-red-500 flex items-center gap-2"
              >
                <span className="text-xs whitespace-nowrap">Sign Out</span>
                <div className="i-ph:sign-out w-4 h-4" />
              </IconButton>
            ) : (
              <IconButton
                onClick={() => void handleOAuthAction('login')}
                title="Sign in with ChatGPT"
                className="bg-purple-500/10 hover:bg-purple-500/20 text-purple-500 flex items-center gap-2"
              >
                <span className="text-xs whitespace-nowrap">Sign In with ChatGPT</span>
                <div className="i-ph:user-circle-plus w-4 h-4" />
              </IconButton>
            )}
          </div>
        </div>

        {reasoningEffortControl}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between py-3 px-1">
      <div className="flex items-center gap-2 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-bolt-elements-textSecondary">{provider?.name} API Key:</span>
          {!isEditing && (
            <div className="flex items-center gap-2">
              {apiKey ? (
                <>
                  <div className="i-ph:check-circle-fill text-green-500 w-4 h-4" />
                  <span className="text-xs text-green-500">Set via UI</span>
                </>
              ) : isEnvKeySet ? (
                <>
                  <div className="i-ph:check-circle-fill text-green-500 w-4 h-4" />
                  <span className="text-xs text-green-500">Set via environment variable</span>
                </>
              ) : (
                <>
                  <div className="i-ph:x-circle-fill text-red-500 w-4 h-4" />
                  <span className="text-xs text-red-500">Not Set (Please set via UI or ENV_VAR)</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {isEditing ? (
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={tempKey}
              placeholder="Enter API Key"
              onChange={(e) => setTempKey(e.target.value)}
              className="w-[300px] px-3 py-1.5 text-sm rounded border border-bolt-elements-borderColor 
                        bg-bolt-elements-prompt-background text-bolt-elements-textPrimary 
                        focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus"
            />
            <IconButton
              onClick={handleSave}
              title="Save API Key"
              className="bg-green-500/10 hover:bg-green-500/20 text-green-500"
            >
              <div className="i-ph:check w-4 h-4" />
            </IconButton>
            <IconButton
              onClick={() => setIsEditing(false)}
              title="Cancel"
              className="bg-red-500/10 hover:bg-red-500/20 text-red-500"
            >
              <div className="i-ph:x w-4 h-4" />
            </IconButton>
          </div>
        ) : (
          <>
            {
              <IconButton
                onClick={() => setIsEditing(true)}
                title="Edit API Key"
                className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-500"
              >
                <div className="i-ph:pencil-simple w-4 h-4" />
              </IconButton>
            }
            {provider?.getApiKeyLink && !apiKey && (
              <IconButton
                onClick={() => window.open(provider?.getApiKeyLink)}
                title="Get API Key"
                className="bg-purple-500/10 hover:bg-purple-500/20 text-purple-500 flex items-center gap-2"
              >
                <span className="text-xs whitespace-nowrap">{provider?.labelForGetApiKey || 'Get API Key'}</span>
                <div className={`${provider?.icon || 'i-ph:key'} w-4 h-4`} />
              </IconButton>
            )}
          </>
        )}
      </div>
    </div>
  );
};
