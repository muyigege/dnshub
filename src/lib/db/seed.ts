import { db } from './connection';
import { aiConfigurations } from './schema';

/**
 * 初始化数据库种子数据
 */
async function seed() {
  console.log('🌱 开始初始化种子数据...');

  try {
    // 检查是否已有 AI 配置
    const existingConfig = await db.select().from(aiConfigurations);

    if (existingConfig.length === 0) {
      console.log('📝 创建默认 AI 配置...');

      await db.insert(aiConfigurations).values({
        name: '默认配置',
        apiUrl: 'https://api.openai.com/v1/chat/completions',
        modelId: 'gpt-4',
        apiKey: '', // 用户需要在配置中心填写自己的 API Key
        isActive: true,
      });

      console.log('✅ 默认 AI 配置创建成功');
    } else {
      console.log('ℹ️  AI 配置已存在，跳过创建');
    }

    console.log('🎉 种子数据初始化完成');
  } catch (error) {
    console.error('❌ 种子数据初始化失败:', error);
    process.exit(1);
  }
}

// 运行种子脚本
seed()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
