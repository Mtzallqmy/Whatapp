export type Intent = 'chat' | 'search' | 'image'

const imageCommand = /^\s*\/(?:image|img)\b/i
const searchCommand = /^\s*\/(?:search|بحث)\b/i

export function detectIntent(text = ''): Intent {
  const t = text.trim().toLowerCase()
  if (imageCommand.test(t)) return 'image'
  if (searchCommand.test(t)) return 'search'

  const imageVerb = /(صم[ممّ]|ارسم|أنش[ئء]|انشئ|ول[دّ]|اصنع|سوي|سوّي|create|generate|draw|design)/i
  const imageNoun = /(صورة|تصميم|بوستر|ملصق|شعار|لوجو|غلاف|إعلان|اعلان|image|poster|logo|cover)/i
  if (imageVerb.test(t) && imageNoun.test(t)) return 'image'

  if (/(ابحث|إبحث|فت[شّ]|دوّر|دور لي|search for|look up)/i.test(t)) return 'search'
  const freshness = /(آخر|أحدث|اليوم|الآن|حاليًا|حاليا|هذا الأسبوع|هذا الشهر|recent|latest|today|current|news|أخبار|اخبار)/i
  const externalFact = /(سعر|نتيجة|موعد|طقس|خبر|أخبار|اخبار|إصدار|اصدار|تحديث|مباراة|سوق|أسهم|اسهم)/i
  if (freshness.test(t) && externalFact.test(t)) return 'search'
  return 'chat'
}

export function stripIntentPrefix(text: string, intent: Intent): string {
  if (intent === 'image') return text.replace(/^\s*(?:\/(?:image|img)|صم[ممّ](?:\s+لي)?|ارسم(?:\s+لي)?|أنش[ئء](?:\s+لي)?|انشئ(?:\s+لي)?|ول[دّ](?:\s+لي)?)\s*/i, '').trim() || text.trim()
  if (intent === 'search') return text.replace(/^\s*(?:\/(?:search|بحث)|ابحث(?:\s+لي)?|إبحث(?:\s+لي)?|فت[شّ](?:\s+لي)?|بحث)\s*/i, '').trim() || text.trim()
  return text.trim()
}
