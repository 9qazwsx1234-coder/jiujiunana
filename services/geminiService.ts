import { Message, AppSettings, OfflineConfig, Mode, Sender, Sticker } from "../types";
import { CORE_SYSTEM_PROMPT, OFFLINE_MODE_PROMPT, ONLINE_MODE_PROMPT } from "../constants";

export const fetchModels = async (proxyUrl: string, apiKey: string): Promise<string[]> => {
  if (!proxyUrl || !apiKey) return [];
  
  let url = proxyUrl;
  if (!url.endsWith('/v1/models')) {
      url = `${url.replace(/\/$/, '')}/v1/models`;
  }

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    if (response.ok) {
      const data = await response.json();
      // Handle standard OpenAI format or Gemini format
      if (data.data && Array.isArray(data.data)) {
         return data.data.map((m: any) => m.id);
      }
      if (data.models && Array.isArray(data.models)) {
         return data.models.map((m: any) => m.name.replace('models/', ''));
      }
    }
  } catch (e) {
    console.warn("Failed to fetch models", e);
  }
  return []; // Return empty if failed, UI will handle
};

export const generateReply = async (
  messages: Message[],
  settings: AppSettings,
  mode: Mode,
  offlineConfig: OfflineConfig,
  stickers: Sticker[]
): Promise<string> => {
  const { proxyUrl, apiKey, model, userDesc, charDesc, worldBook, bannedWords, userName, charName, realTimeEnabled } = settings;

  if (!apiKey || !proxyUrl || !model) {
    throw new Error("请先在设置中配置API地址、密钥并选择模型。");
  }

  // 1. Build System Instruction
  let systemInstruction = CORE_SYSTEM_PROMPT
    .replace(/{{char}}/g, charName)
    .replace(/{{user}}/g, userName);
  
  systemInstruction += `\n\n【世界书/背景设定】\n${worldBook}`;
  systemInstruction += `\n\n【${charName}的人设】\n${charDesc}`;
  systemInstruction += `\n\n【${userName}的人设】\n${userDesc}`;
  systemInstruction += `\n\n【全局禁词】\n${bannedWords}`;

  if (mode === Mode.Offline) {
    systemInstruction += `\n\n${OFFLINE_MODE_PROMPT}`;
    
    // Strict Offline Constraints
    systemInstruction += `\n\n【线下模式严格执行标准】`;
    if (offlineConfig.bannedWords) {
      systemInstruction += `\n1. 绝对禁止词汇（必须替换其他表达）: ${offlineConfig.bannedWords}`;
    }
    if (offlineConfig.minWords > 0 || offlineConfig.maxWords > 0) {
       const min = offlineConfig.minWords || 0;
       const max = offlineConfig.maxWords || 9999;
       systemInstruction += `\n2. 回复字数限制: 必须严格控制在 ${min} 到 ${max} 字之间。`;
    }

    // Inject active offline presets
    const activePresets = offlineConfig.presets.filter(p => p.enabled);
    if (activePresets.length > 0) {
      systemInstruction += `\n\n【必须遵循的当前预设条目】\n请逐条思考并落实到回复中，不可敷衍：\n`;
      activePresets.forEach(p => {
        systemInstruction += `- [${p.name}]: ${p.content}\n`;
      });
    }
  } else {
    systemInstruction += `\n\n${ONLINE_MODE_PROMPT}`;
    
    // Real Time Clock Injection (Only Online)
    if (realTimeEnabled) {
      const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
      systemInstruction += `\n\n【当前实时时间 (中国北京时间)】\n现在是：${now}\n请根据当前时间调整对话内容（如问候早安/晚安）。`;
    }

    // Inject Stickers info for Online Mode (ONLY allowAI ones)
    const availableStickers = stickers.filter(s => s.allowAI);
    if (availableStickers.length > 0) {
      systemInstruction += `\n\n【可用表情包列表】\n你必须根据当前情境和人设，适时使用表情包以增强互动感。\n使用格式：[sticker: 表情包名称]\n\n可选表情包（名称即含义）：\n${availableStickers.map(s => `- ${s.name}`).join('\n')}`;
    }
  }

  // 2. Build History
  const history = messages.map(m => {
    let content = m.content;
    
    // Special Types Handling
    if (m.isRecalled) {
      // AI knows it was recalled and can see the original content
      content = `[系统提示: ${m.sender === Sender.User ? '用户' : '你'} 撤回了一条消息。撤回的原内容是: "${m.content}"。你可以选择忽略它或对撤回行为做出反应。]`;
    } else if (m.type === 'sticker') {
      const stickerObj = stickers.find(s => s.url === m.content);
      const stickerName = stickerObj ? stickerObj.name : '未知表情包';
      content = `[发送了表情包: ${stickerName}]`; 
    } else if (m.type === 'voice') {
      content = `[发送了语音消息: "${m.content}"]`;
    }

    // Quote Handling
    if (m.quote && !m.isRecalled) {
      content = `> 引用 ${m.quote.senderName}: ${m.quote.content}\n\n${content}`;
    }

    return {
      role: m.sender === Sender.User ? 'user' : 'assistant',
      content: content
    };
  });

  // 3. API Call
  let endpoint = proxyUrl;
  if (!endpoint.endsWith('/v1/chat/completions')) {
     endpoint = `${endpoint.replace(/\/$/, '')}/v1/chat/completions`;
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemInstruction },
          ...history
        ],
        temperature: 0.85,
        presence_penalty: 0.2
      })
    });

    if (!response.ok) {
       throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";

  } catch (error) {
    console.error(error);
    throw error;
  }
};
