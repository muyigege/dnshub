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

  // 已经是完整的 chat/completions 端点，直接返回
  if (/\/chat\/completions$/i.test(trimmed)) {
    return trimmed;
  }

  // 已经包含版本号（如 /v1），补全 chat/completions
  if (/\/v\d+$/i.test(trimmed)) {
    return `${trimmed}/chat/completions`;
  }

  // 根域名（如 https://api.openai.com）：自动补全为 /v1/chat/completions
  // 仅对常见的 OpenAI 兼容 API 主机生效，避免误伤自定义路径
  try {
    const parsed = new URL(trimmed);
    // 路径为空或仅为 /
    if (parsed.pathname === '/' || parsed.pathname === '') {
      return `${trimmed}/v1/chat/completions`;
    }
  } catch {
    // 不是合法 URL，原样返回
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
