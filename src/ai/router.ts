import { config } from '../config.js'
import { addMessage, recentMessages, resetConversation } from '../db/conversations.js'
import { getDefaultProvider, getProviderById, providerPricing } from '../db/providers.js'
import { getSettings } from '../db/settings.js'
import type { AppUser, ModelRoute, ProviderWithSecret } from '../db/types.js'
import { recordApiUsage } from '../db/usage.js'
import { getUserUsageSummary } from '../db/users.js'
import { createAIProvider } from './providers/factory.js'
import { createSearchAdapter } from './search/factory.js'
import { detectIntent, stripIntentPrefix, type Intent } from './intent.js'
import type { ChatMessage, TextGenerationResult } from './types.js'

const SYSTEM = `أنت ${config.botName}، مساعد ذكاء اصطناعي خاص عبر واتساب. أجب بالعربية ما لم يطلب المستخدم لغة أخرى. كن دقيقًا ومباشرًا. لا تدّعِ الوصول للإنترنت أو لمعلومة حديثة إلا عندما تزود بنتائج بحث فعلية.`

function estimateTextCost(provider: ProviderWithSecret, result: TextGenerationResult): number {
  const pricing = providerPricing(provider.config)
  return (result.usage.inputTokens / 1_000_000) * pricing.inputCostPer1M +
    (result.usage.outputTokens / 1_000_000) * pricing.outputCostPer1M
}

async function resolveAI(route: ModelRoute, taskLabel: string): Promise<{ provider: ProviderWithSecret; model: string }> {
  const provider = route.providerId ? await getProviderById(route.providerId) : await getDefaultProvider('ai')
  if (!provider) throw new Error(`لا يوجد مزود ذكاء اصطناعي مفعّل لوظيفة ${taskLabel}.`)
  const configKey = taskLabel === 'الصور' ? 'defaultImageModel' : taskLabel === 'الرؤية' ? 'defaultVisionModel' : 'defaultChatModel'
  const model = route.model || String(provider.config[configKey] || '')
  if (!model) throw new Error(`حدد نموذج ${taskLabel} من لوحة الإدارة أولًا.`)
  return { provider, model }
}

async function callText(userId: string, taskType: string, route: ModelRoute, messages: ChatMessage[], system = SYSTEM) {
  const { provider, model } = await resolveAI(route, taskType === 'vision' ? 'الرؤية' : taskType === 'search_synthesis' ? 'البحث' : 'المحادثة')
  const adapter = createAIProvider(provider)
  const result = await adapter.chat({ model, system, messages })
  await recordApiUsage({
    userId, providerId: provider.id, provider: provider.type, model, type: taskType,
    inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens,
    estimatedCostUsd: estimateTextCost(provider, result)
  })
  return result.text
}

export async function runChat(user: AppUser, text: string): Promise<{ type: 'text'; text: string }> {
  const settings = await getSettings()
  await addMessage(user.id, 'user', text)
  const history = await recentMessages(user.id, config.maxMemoryMessages)
  const answer = await callText(user.id, 'chat', settings.modelRoutes.chat, history)
  await addMessage(user.id, 'assistant', answer)
  return { type: 'text', text: answer }
}

export async function runSearch(user: AppUser, text: string): Promise<{ type: 'text'; text: string }> {
  const settings = await getSettings()
  const cleaned = stripIntentPrefix(text, 'search')
  const searchProvider = settings.modelRoutes.searchProviderId
    ? await getProviderById(settings.modelRoutes.searchProviderId)
    : await getDefaultProvider('search')
  if (!searchProvider) throw new Error('ميزة البحث غير مفعلة. أضف Tavily أو Serper أو Brave وحدده كمزود بحث.')
  const adapter = createSearchAdapter(searchProvider)
  const result = await adapter.search(cleaned)
  const pricing = providerPricing(searchProvider.config)
  await recordApiUsage({
    userId: user.id, providerId: searchProvider.id, provider: searchProvider.type, model: searchProvider.type,
    type: 'search', estimatedCostUsd: pricing.requestCost, metadata: { sourceCount: result.sources.length }
  })
  if (!result.sources.length) return { type: 'text', text: 'لم أجد نتائج موثوقة لهذا البحث.' }

  const sourceContext = result.sources.map((source, i) => `[${i + 1}] ${source.title}\n${source.snippet}`).join('\n\n')
  const prompt = `سؤال المستخدم: ${cleaned}\n\nنتائج البحث المرقمة:\n${sourceContext}\n\nأجب اعتمادًا على هذه النتائج فقط للحقائق الحديثة. استخدم أرقام المصادر مثل [1] عند الحاجة، ولا تنشئ روابط ولا قسم مصادر.`
  const synthesisRoute = settings.modelRoutes.search.providerId || settings.modelRoutes.search.model
    ? settings.modelRoutes.search
    : settings.modelRoutes.chat
  const answer = await callText(user.id, 'search_synthesis', synthesisRoute, [{ role: 'user', content: prompt }], `${SYSTEM}\nالحقائق الحديثة يجب أن تستند حصريًا إلى نتائج البحث المرفقة.`)
  const sources = result.sources.map((source, i) => `${i + 1}. ${source.title}\n${source.url}`).join('\n\n')
  const finalText = `${answer}\n\nالمصادر:\n${sources}`
  await addMessage(user.id, 'user', text, 'search')
  await addMessage(user.id, 'assistant', finalText, 'search')
  return { type: 'text', text: finalText }
}

function enhanceImagePrompt(text: string): string {
  const prompt = stripIntentPrefix(text, 'image')
  if (prompt.length >= 60) return prompt
  return `${prompt}. حافظ على الفكرة الأصلية بدقة، بتكوين بصري واضح، تفاصيل متماسكة، وجودة احترافية، وتجنب إضافة نصوص غير مطلوبة.`
}

export async function runImage(user: AppUser, text: string): Promise<{ type: 'image'; image: Buffer; mimeType: string; caption: string }> {
  const settings = await getSettings()
  const { provider, model } = await resolveAI(settings.modelRoutes.image, 'الصور')
  const adapter = createAIProvider(provider)
  if (!adapter.image) throw new Error(`المزود ${provider.name} لا يدعم توليد الصور في هذا التطبيق.`)
  const prompt = enhanceImagePrompt(text)
  const result = await adapter.image({ model, prompt })
  const pricing = providerPricing(provider.config)
  await recordApiUsage({
    userId: user.id, providerId: provider.id, provider: provider.type, model, type: 'image',
    inputTokens: result.usage?.inputTokens || 0, outputTokens: result.usage?.outputTokens || 0,
    images: 1, estimatedCostUsd: pricing.imageCost || (result.usage ? ((result.usage.inputTokens / 1_000_000) * pricing.inputCostPer1M + (result.usage.outputTokens / 1_000_000) * pricing.outputCostPer1M) : 0)
  })
  await addMessage(user.id, 'user', text, 'image')
  await addMessage(user.id, 'assistant', `[تم إنشاء صورة] ${prompt.slice(0, 500)}`, 'image')
  return { type: 'image', image: result.image, mimeType: result.mimeType, caption: 'تم إنشاء الصورة بنجاح.' }
}

export async function runVision(user: AppUser, question: string, image: Buffer, mimeType: string) {
  const settings = await getSettings()
  const { provider, model } = await resolveAI(settings.modelRoutes.vision, 'الرؤية')
  const adapter = createAIProvider(provider)
  if (!adapter.vision) throw new Error(`المزود ${provider.name} لا يدعم تحليل الصور في هذا التطبيق.`)
  const prompt = question.trim() || 'حلّل هذه الصورة واشرح محتواها بوضوح.'
  const history = await recentMessages(user.id, Math.min(config.maxMemoryMessages, 8))
  const messages = [...history, { role: 'user' as const, content: prompt }]
  const result = await adapter.vision({ model, system: SYSTEM, messages, image, mimeType })
  await recordApiUsage({
    userId: user.id, providerId: provider.id, provider: provider.type, model, type: 'vision',
    inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens,
    estimatedCostUsd: estimateTextCost(provider, result)
  })
  await addMessage(user.id, 'user', `[صورة] ${prompt}`, 'vision')
  await addMessage(user.id, 'assistant', result.text, 'vision')
  return { type: 'text' as const, text: result.text }
}

export async function runFile(user: AppUser, question: string, fileName: string, extractedText: string) {
  const settings = await getSettings()
  const instruction = question.trim() || 'لخّص هذا الملف واذكر أهم النقاط.'
  const prompt = `اسم الملف: ${fileName}\nطلب المستخدم: ${instruction}\n\nمحتوى الملف:\n${extractedText}`
  const route = settings.modelRoutes.advanced.providerId || settings.modelRoutes.advanced.model
    ? settings.modelRoutes.advanced : settings.modelRoutes.chat
  const answer = await callText(user.id, 'file', route, [{ role: 'user', content: prompt }])
  await addMessage(user.id, 'user', `[ملف: ${fileName}] ${instruction}`, 'file')
  await addMessage(user.id, 'assistant', answer, 'file')
  return { type: 'text' as const, text: answer }
}

export async function handleCommand(user: AppUser, text: string): Promise<{ handled: boolean; result?: { type: 'text'; text: string } }> {
  const command = text.trim().toLowerCase().split(/\s+/)[0]
  if (command === '/reset') {
    await resetConversation(user.id)
    return { handled: true, result: { type: 'text', text: 'تم مسح سياق محادثتك الحالية.' } }
  }
  if (command === '/usage') {
    const usage = await getUserUsageSummary(user.id)
    const monthLimit = user.role === 'admin' ? 'غير محدود' : (user.monthly_limit ?? 'غير محدد')
    const dailyLimit = user.role === 'admin' ? 'غير محدود' : user.daily_limit
    return { handled: true, result: { type: 'text', text: `استخدامك اليوم: ${usage.today}/${dailyLimit}\nهذا الشهر: ${usage.month}/${monthLimit}\nالتكلفة التقديرية اليوم: $${usage.costToday.toFixed(4)}` } }
  }
  if (command === '/help') {
    return { handled: true, result: { type: 'text', text: 'يمكنك الكتابة بشكل طبيعي للمحادثة، أو طلب بحث حديث، أو تصميم صورة، أو إرسال صورة/ملف مع سؤال. أوامر اختيارية: /search /image /usage /reset /model /help' } }
  }
  if (command === '/model') {
    const settings = await getSettings()
    return { handled: true, result: { type: 'text', text: `النماذج الحالية:\nChat: ${settings.modelRoutes.chat.model || 'غير محدد'}\nAdvanced: ${settings.modelRoutes.advanced.model || 'غير محدد'}\nVision: ${settings.modelRoutes.vision.model || 'غير محدد'}\nSearch: ${settings.modelRoutes.search.model || settings.modelRoutes.chat.model || 'غير محدد'}\nImage: ${settings.modelRoutes.image.model || 'غير محدد'}` } }
  }
  return { handled: false }
}

export async function routeAI(user: AppUser, text: string): Promise<{ intent: Intent; result: { type: 'text'; text: string } | { type: 'image'; image: Buffer; mimeType: string; caption: string } }> {
  const intent = detectIntent(text)
  if (intent === 'search') return { intent, result: await runSearch(user, text) }
  if (intent === 'image') return { intent, result: await runImage(user, text) }
  return { intent, result: await runChat(user, text) }
}
