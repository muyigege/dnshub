import { AIConfiguration } from '@/lib/db/schema';
import { decrypt } from '@/lib/encryption';

export type AIConfigKeyStatus = 'ok' | 'missing' | 'invalid';

export type AIConfigurationForClient = Omit<AIConfiguration, 'apiKey'> & {
  apiKey: string;
  apiKeyStatus: AIConfigKeyStatus;
  apiKeyError?: string;
};

const toErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export function normalizeAIChatCompletionsUrl(apiUrl: string) {
  const trimmed = apiUrl.trim().replace(/\/+$/, '');

  if (/\/chat\/completions$/i.test(trimmed)) {
    return trimmed;
  }

  if (/\/v\d+$/i.test(trimmed)) {
    return `${trimmed}/chat/completions`;
  }

  return trimmed;
}

export function decryptAIConfigurationForClient(
  config: AIConfiguration
): AIConfigurationForClient {
  if (!config.apiKey) {
    return {
      ...config,
      apiKey: '',
      apiKeyStatus: 'missing',
      apiKeyError: 'API Key 为空，请重新填写',
    };
  }

  try {
    return {
      ...config,
      apiKey: decrypt(config.apiKey),
      apiKeyStatus: 'ok',
    };
  } catch (error) {
    console.warn(`AI config ${config.id} API key cannot be decrypted; please re-enter the API key.`);
    return {
      ...config,
      apiKey: '',
      apiKeyStatus: 'invalid',
      apiKeyError: 'API Key 无法解密，请重新填写并保存',
    };
  }
}

export function decryptAIConfigurationForRuntime(config: AIConfiguration) {
  const clientConfig = decryptAIConfigurationForClient(config);

  if (clientConfig.apiKeyStatus !== 'ok') {
    throw new Error(clientConfig.apiKeyError || 'AI 配置 API Key 无效');
  }

  return {
    ...clientConfig,
    apiUrl: normalizeAIChatCompletionsUrl(clientConfig.apiUrl),
  };
}

export function getAIConfigErrorMessage(error: unknown) {
  return toErrorMessage(error);
}
