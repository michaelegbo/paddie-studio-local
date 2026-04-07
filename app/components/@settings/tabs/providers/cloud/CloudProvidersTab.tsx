import React, { useEffect, useState, useCallback } from 'react';
import { Switch } from '~/components/ui/Switch';
import { useSettings } from '~/lib/hooks/useSettings';
import { URL_CONFIGURABLE_PROVIDERS } from '~/lib/stores/settings';
import type { IProviderConfig } from '~/types/model';
import { logStore } from '~/lib/stores/logs';
import { motion } from 'framer-motion';
import { classNames } from '~/utils/classNames';
import { toast } from 'react-toastify';
import { providerBaseUrlEnvKeys } from '~/utils/constants';
import { SiAmazon, SiGoogle, SiGithub, SiHuggingface, SiPerplexity, SiOpenai } from 'react-icons/si';
import { isElectronRenderer } from '~/utils/environment';
import { BsRobot, BsCloud } from 'react-icons/bs';
import { TbBrain, TbCloudComputing } from 'react-icons/tb';
import { BiCodeBlock, BiChip } from 'react-icons/bi';
import { FaCloud, FaBrain } from 'react-icons/fa';
import type { IconType } from 'react-icons';
import { APIKeyManager } from '~/components/chat/APIKeyManager';
import { sortProvidersByPriority } from '~/lib/modules/llm/provider-utils';

// Add type for provider names to ensure type safety
type ProviderName =
  | 'AmazonBedrock'
  | 'Anthropic'
  | 'ChatGPT Codex'
  | 'Cohere'
  | 'Deepseek'
  | 'Github'
  | 'Google'
  | 'Groq'
  | 'HuggingFace'
  | 'Hyperbolic'
  | 'Mistral'
  | 'OpenAI'
  | 'OpenRouter'
  | 'Perplexity'
  | 'Together'
  | 'XAI'
  | 'ZAI';

// Update the PROVIDER_ICONS type to use the ProviderName type
const PROVIDER_ICONS: Record<ProviderName, IconType> = {
  AmazonBedrock: SiAmazon,
  Anthropic: FaBrain,
  'ChatGPT Codex': SiOpenai,
  Cohere: BiChip,
  Deepseek: BiCodeBlock,
  Github: SiGithub,
  Google: SiGoogle,
  Groq: BsCloud,
  HuggingFace: SiHuggingface,
  Hyperbolic: TbCloudComputing,
  Mistral: TbBrain,
  OpenAI: SiOpenai,
  OpenRouter: FaCloud,
  Perplexity: SiPerplexity,
  Together: BsCloud,
  XAI: BsRobot,
  ZAI: BsRobot,
};

// Update PROVIDER_DESCRIPTIONS to use the same type
const PROVIDER_DESCRIPTIONS: Partial<Record<ProviderName, string>> = {
  Anthropic: 'Access Claude and other Anthropic models',
  Github: 'Use OpenAI models hosted through GitHub infrastructure',
  'ChatGPT Codex': 'Use your ChatGPT Codex access in the Electron app instead of API credits',
  OpenAI: 'Use GPT-4, GPT-3.5, and other OpenAI models',
  ZAI: 'Use Z.AI GLM Coding Plan models via the dedicated coding endpoint',
};

const CloudProvidersTab = () => {
  const settings = useSettings();
  const isElectron = isElectronRenderer();
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [filteredProviders, setFilteredProviders] = useState<IProviderConfig[]>([]);
  const [categoryEnabled, setCategoryEnabled] = useState<boolean>(false);

  // Load and filter providers
  useEffect(() => {
    const newFilteredProviders = Object.entries(settings.providers || {})
      .filter(([key]) => !['Ollama', 'LMStudio', 'OpenAILike'].includes(key))
      .map(([key, value]) => ({
        name: key,
        settings: value.settings,
        staticModels: value.staticModels || [],
        getDynamicModels: value.getDynamicModels,
        authType: value.authType,
        authApiPath: value.authApiPath,
        requiresElectron: value.requiresElectron,
        getApiKeyLink: value.getApiKeyLink,
        labelForGetApiKey: value.labelForGetApiKey,
        icon: value.icon,
      }));

    const sorted = sortProvidersByPriority(newFilteredProviders);
    setFilteredProviders(sorted);

    // Update category enabled state
    const toggleableProviders = newFilteredProviders.filter((p) => !p.requiresElectron || isElectron);
    const allEnabled = toggleableProviders.length > 0 && toggleableProviders.every((p) => p.settings.enabled);
    setCategoryEnabled(allEnabled);
  }, [isElectron, settings.providers]);

  const handleToggleCategory = useCallback(
    (enabled: boolean) => {
      // Update all providers
      filteredProviders.forEach((provider) => {
        if (provider.requiresElectron && !isElectron) {
          return;
        }

        settings.updateProviderSettings(provider.name, { ...provider.settings, enabled });
      });

      setCategoryEnabled(enabled);
      toast.success(enabled ? 'All cloud providers enabled' : 'All cloud providers disabled');
    },
    [filteredProviders, isElectron, settings],
  );

  const handleToggleProvider = useCallback(
    (provider: IProviderConfig, enabled: boolean) => {
      if (provider.requiresElectron && !isElectron) {
        toast.info(`${provider.name} is only available in the Electron app.`);
        return;
      }

      // Update the provider settings in the store
      settings.updateProviderSettings(provider.name, { ...provider.settings, enabled });

      if (enabled) {
        logStore.logProvider(`Provider ${provider.name} enabled`, { provider: provider.name });
        toast.success(`${provider.name} enabled`);
      } else {
        logStore.logProvider(`Provider ${provider.name} disabled`, { provider: provider.name });
        toast.success(`${provider.name} disabled`);
      }
    },
    [isElectron, settings],
  );

  const handleUpdateBaseUrl = useCallback(
    (provider: IProviderConfig, baseUrl: string) => {
      const newBaseUrl: string | undefined = baseUrl.trim() || undefined;

      // Update the provider settings in the store
      settings.updateProviderSettings(provider.name, { ...provider.settings, baseUrl: newBaseUrl });

      logStore.logProvider(`Base URL updated for ${provider.name}`, {
        provider: provider.name,
        baseUrl: newBaseUrl,
      });
      toast.success(`${provider.name} base URL updated`);
      setEditingProvider(null);
    },
    [settings],
  );

  return (
    <div className="space-y-6">
      <motion.div
        className="space-y-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-center justify-between gap-4 mt-8 mb-4">
          <div className="flex items-center gap-2">
            <div
              className={classNames(
                'w-8 h-8 flex items-center justify-center rounded-lg',
                'bg-bolt-elements-background-depth-3',
                'text-purple-500',
              )}
            >
              <TbCloudComputing className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-md font-medium text-bolt-elements-textPrimary">Cloud Providers</h4>
              <p className="text-sm text-bolt-elements-textSecondary">Connect to cloud-based AI models and services</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-bolt-elements-textSecondary">Enable All Cloud</span>
            <Switch checked={categoryEnabled} onCheckedChange={handleToggleCategory} disabled={!isElectron} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredProviders.map((provider, index) => {
            const isUnavailableInBrowser = !!provider.requiresElectron && !isElectron;

            return (
              <motion.div
                key={provider.name}
                className={classNames(
                  'rounded-lg border bg-bolt-elements-background text-bolt-elements-textPrimary shadow-sm',
                  'bg-bolt-elements-background-depth-2',
                  'hover:bg-bolt-elements-background-depth-3',
                  'transition-all duration-200',
                  'relative overflow-hidden group',
                  'flex flex-col',
                  isUnavailableInBrowser ? 'opacity-70' : undefined,
                )}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ scale: 1.02 }}
              >
                <div className="absolute top-0 right-0 p-2 flex gap-1">
                  {isUnavailableInBrowser && (
                    <motion.span
                      className="px-2 py-0.5 text-xs rounded-full bg-bolt-elements-background-depth-4 text-bolt-elements-textSecondary font-medium"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      Electron only
                    </motion.span>
                  )}
                  {URL_CONFIGURABLE_PROVIDERS.includes(provider.name) && (
                    <motion.span
                      className="px-2 py-0.5 text-xs rounded-full bg-purple-500/10 text-purple-500 font-medium"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      Configurable
                    </motion.span>
                  )}
                </div>

                <div className="flex items-start gap-4 p-4">
                  <motion.div
                    className={classNames(
                      'w-10 h-10 flex items-center justify-center rounded-xl',
                      'bg-bolt-elements-background-depth-3 group-hover:bg-bolt-elements-background-depth-4',
                      'transition-all duration-200',
                      provider.settings.enabled ? 'text-purple-500' : 'text-bolt-elements-textSecondary',
                    )}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    <div
                      className={classNames('w-6 h-6', 'transition-transform duration-200', 'group-hover:rotate-12')}
                    >
                      {React.createElement(PROVIDER_ICONS[provider.name as ProviderName] || BsRobot, {
                        className: 'w-full h-full',
                        'aria-label': `${provider.name} logo`,
                      })}
                    </div>
                  </motion.div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-4 mb-2">
                      <div>
                        <h4 className="text-sm font-medium text-bolt-elements-textPrimary group-hover:text-purple-500 transition-colors">
                          {provider.name}
                        </h4>
                        <p className="text-xs text-bolt-elements-textSecondary mt-0.5">
                          {PROVIDER_DESCRIPTIONS[provider.name as keyof typeof PROVIDER_DESCRIPTIONS] ||
                            (URL_CONFIGURABLE_PROVIDERS.includes(provider.name)
                              ? 'Configure custom endpoint for this provider'
                              : 'Standard AI provider integration')}
                        </p>
                      </div>
                      <Switch
                        checked={provider.settings.enabled}
                        onCheckedChange={(checked) => handleToggleProvider(provider, checked)}
                        disabled={isUnavailableInBrowser}
                      />
                    </div>

                    {provider.settings.enabled && URL_CONFIGURABLE_PROVIDERS.includes(provider.name) && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className="flex items-center gap-2 mt-4">
                          {editingProvider === provider.name ? (
                            <input
                              type="text"
                              defaultValue={provider.settings.baseUrl}
                              placeholder={`Enter ${provider.name} base URL`}
                              className={classNames(
                                'flex-1 px-3 py-1.5 rounded-lg text-sm',
                                'bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor',
                                'text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary',
                                'focus:outline-none focus:ring-2 focus:ring-purple-500/30',
                                'transition-all duration-200',
                              )}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleUpdateBaseUrl(provider, e.currentTarget.value);
                                } else if (e.key === 'Escape') {
                                  setEditingProvider(null);
                                }
                              }}
                              onBlur={(e) => handleUpdateBaseUrl(provider, e.target.value)}
                              autoFocus
                            />
                          ) : (
                            <div
                              className="flex-1 px-3 py-1.5 rounded-lg text-sm cursor-pointer group/url"
                              onClick={() => setEditingProvider(provider.name)}
                            >
                              <div className="flex items-center gap-2 text-bolt-elements-textSecondary">
                                <div className="i-ph:link text-sm" />
                                <span className="group-hover/url:text-purple-500 transition-colors">
                                  {provider.settings.baseUrl || 'Click to set base URL'}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>

                        {providerBaseUrlEnvKeys[provider.name]?.baseUrlKey && (
                          <div className="mt-2 text-xs text-green-500">
                            <div className="flex items-center gap-1">
                              <div className="i-ph:info" />
                              <span>Environment URL set in .env file</span>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </div>
                </div>

                {provider.authType === 'oauth' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="px-4 pb-4"
                  >
                    <div className="rounded-lg bg-bolt-elements-background-depth-3 px-3 border border-bolt-elements-borderColor">
                      <APIKeyManager provider={provider} apiKey="" setApiKey={(_key) => undefined} />
                    </div>
                  </motion.div>
                )}

                <motion.div
                  className="absolute inset-0 border-2 border-purple-500/0 rounded-lg pointer-events-none"
                  animate={{
                    borderColor: provider.settings.enabled ? 'rgba(168, 85, 247, 0.2)' : 'rgba(168, 85, 247, 0)',
                    scale: provider.settings.enabled ? 1 : 0.98,
                  }}
                  transition={{ duration: 0.2 }}
                />
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
};

export default CloudProvidersTab;
