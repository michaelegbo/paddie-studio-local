import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';
import type { LanguageModelV1 } from 'ai';
import { CodexLanguageModel } from './codex-language-model';
import { CHATGPT_CODEX_PROVIDER_NAME } from '~/lib/modules/llm/provider-utils';

export default class CodexProvider extends BaseProvider {
  name = CHATGPT_CODEX_PROVIDER_NAME;
  authType = 'oauth' as const;
  authApiPath = '/api/codex-auth';
  requiresElectron = true;

  config = {};

  staticModels: ModelInfo[] = [
    { name: 'gpt-5.4', label: 'GPT-5.4', provider: CHATGPT_CODEX_PROVIDER_NAME, maxTokenAllowed: 32000 },
    {
      name: 'gpt-5.3-codex',
      label: 'GPT-5.3-Codex',
      provider: CHATGPT_CODEX_PROVIDER_NAME,
      maxTokenAllowed: 32000,
    },
    {
      name: 'gpt-5.2-codex',
      label: 'GPT-5.2-Codex',
      provider: CHATGPT_CODEX_PROVIDER_NAME,
      maxTokenAllowed: 32000,
    },
    {
      name: 'gpt-5.1-codex',
      label: 'GPT-5.1-Codex',
      provider: CHATGPT_CODEX_PROVIDER_NAME,
      maxTokenAllowed: 32000,
    },
    {
      name: 'gpt-5.1-codex-max',
      label: 'GPT-5.1-Codex Max',
      provider: CHATGPT_CODEX_PROVIDER_NAME,
      maxTokenAllowed: 32000,
    },
  ];

  getModelInstance(_options: {
    model: string;
    serverEnv?: Env;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }): LanguageModelV1 {
    return new CodexLanguageModel(_options.model, {
      reasoningEffort: _options.providerSettings?.[this.name]?.reasoningEffort,
    });
  }
}
