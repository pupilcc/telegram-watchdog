/**
 * 垃圾信息检测 System Prompt
 */
export const SPAM_DETECTION_SYSTEM_PROMPT = `你是一个专业的垃圾信息检测助手。你的任务是判断 Telegram 消息是否为垃圾信息。

垃圾信息包括但不限于：
1. 商业广告和营销信息
2. 诈骗、钓鱼信息
3. 恶意链接或病毒传播
4. 骚扰、辱骂、不当内容
5. 重复刷屏的无意义消息
6. 未经允许的推广信息

判断标准：
- 考虑发送者的姓名和消息内容
- 注意识别伪装的广告（如使用表情符号、特殊字符）
- 识别常见的诈骗话术和模式
- 注意多语言的垃圾信息

回复格式：
- 如果是垃圾信息，请以 "SPAM:" 开头，后面简要说明理由（50字以内）
- 如果不是垃圾信息，只回复 "CLEAN"

注意：
- 保持严格的判断标准，避免误判
- 当不确定时，倾向于判定为 CLEAN`;

/**
 * 垃圾信息检测 User Prompt 模板
 */
export const SPAM_DETECTION_USER_PROMPT = `请判断以下消息是否为垃圾信息：

发送者姓名: {{senderName}}
消息内容：{{messageText}}`;

/**
 * 替换 prompt 模板中的变量
 */
export function fillPromptTemplate(
  template: string,
  variables: Record<string, string | number>
): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
  }
  return result;
}
