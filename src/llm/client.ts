import OpenAI from 'openai';
import { noul, TypeSafeClient } from '@typesafe-ai/sdk';
import { Env } from '@/env';
import {
  SPAM_DETECTION_SYSTEM_PROMPT,
  SPAM_DETECTION_USER_PROMPT,
  fillPromptTemplate
} from './prompt';

/**
 * 创建 OpenAI 客户端
 */
function createOpenAIClient(env: Env): OpenAI {
  return new OpenAI({
    baseURL: env.LLM_API,
    apiKey: env.LLM_KEY
  });
}

/**
 * 通用 AI API 调用函数
 * @param env - 环境变量
 * @param systemPrompt - 系统提示词
 * @param userPrompt - 用户提示词
 * @param options - 可选配置
 * @returns AI 的响应文本
 */
export async function callAI(
  env: Env,
  systemPrompt: string,
  userPrompt: string,
  options?: {
    model?: string;
    temperature?: number;
  }
): Promise<string> {
  const client = createOpenAIClient(env);

  const response = await client.chat.completions.create({
    model: options?.model || env.LLM_MODEL || 'gpt-3.5-turbo',
    temperature: options?.temperature ?? 0.3,
    messages: [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: userPrompt
      }
    ]
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('AI 返回空响应');
  }

  return content.trim();
}

/**
 * 垃圾信息检测函数
 * @param env - 环境变量
 * @param senderName - 发送者姓名
 * @param messageText - 消息内容
 * @returns 判断结果（以 "SPAM:" 开头表示是垃圾信息，"CLEAN" 表示正常消息）
 */
export async function detectSpam(
  env: Env,
  senderName: string,
  messageText: string
): Promise<string> {
  if (env.SPAM_PROVIDER === 'jev') {
    if (!env.JEV_KEY) throw new Error('Missing required environment variable: JEV_KEY');

    const { answers } = await new TypeSafeClient({
      apiKey: env.JEV_KEY,
      timeout: 5000,
      retry: { maxRetries: 0 }
    }).systemOne({
      model: 'jev-latest',
      state: { senderName, messageText },
      questions: {
        spam: noul(
          'Is `messageText` from `senderName` unwanted spam, advertising, a scam, phishing, harassment, or malicious content in a one-to-one conversation? Judge the message itself; when uncertain, lean toward legitimate conversation.',
          {
            true: 'Unwanted promotion, scam, phishing, harassment, or malicious content',
            false: 'Legitimate conversation or uncertain intent'
          }
        )
      }
    });

    const probability = answers.spam?.noul;
    if (typeof probability !== 'number' || !Number.isFinite(probability) || probability < 0 || probability > 1) {
      throw new Error('Jev API returned an invalid spam probability');
    }
    return probability >= 0.85 ? `SPAM: Jev 垃圾概率 ${probability.toFixed(2)}` : 'CLEAN';
  }

  // 填充用户 prompt 模板
  const userPrompt = fillPromptTemplate(SPAM_DETECTION_USER_PROMPT, {
    senderName,
    messageText
  });

  // 调用 AI API
  // 不传 options 参数，使用 callAI 的默认配置
  // temperature 默认为 0.3，model 默认使用 env.LLM_MODEL
  const judgment = await callAI(
    env,
    SPAM_DETECTION_SYSTEM_PROMPT,
    userPrompt
  );

  return judgment;
}
