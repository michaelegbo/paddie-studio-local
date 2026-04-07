import { BaseProvider, getOpenAILikeModel } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';
import type { LanguageModelV1 } from 'ai';

export default class ZAIProvider extends BaseProvider {
  name = 'ZAI';
  getApiKeyLink = 'https://z.ai/manage-apikey/apikey-list';

  config = {
    baseUrlKey: 'ZAI_API_BASE_URL',

    // Default to the Coding Plan endpoint; users can override this in settings if needed.
    baseUrl: 'https://api.z.ai/api/coding/paas/v4',
    apiTokenKey: 'ZAI_API_KEY',
  };

  staticModels: ModelInfo[] = [
    { name: 'glm-5.1', label: 'GLM-5.1 (Coding Plan)', provider: 'ZAI', maxTokenAllowed: 8000 },
    { name: 'glm-5', label: 'GLM-5 (Coding Plan)', provider: 'ZAI', maxTokenAllowed: 8000 },
    { name: 'glm-4.7', label: 'GLM-4.7 (Coding Plan)', provider: 'ZAI', maxTokenAllowed: 8000 },
    { name: 'glm-4.5-air', label: 'GLM-4.5-Air (Coding Plan)', provider: 'ZAI', maxTokenAllowed: 8000 },
  ];

  getModelInstance(options: {
    model: string;
    serverEnv: Env;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }): LanguageModelV1 {
    const { model, serverEnv, apiKeys, providerSettings } = options;

    const { baseUrl, apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: providerSettings?.[this.name],
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: 'ZAI_API_BASE_URL',
      defaultApiTokenKey: 'ZAI_API_KEY',
    });

    if (!baseUrl || !apiKey) {
      throw new Error(`Missing configuration for ${this.name} provider`);
    }

    return getOpenAILikeModel(baseUrl, apiKey, model);
  }
}
