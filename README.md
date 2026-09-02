# WhatsApp AI Gateway

بوابة واتساب خاصة مبنية على **Baileys + Node.js/TypeScript + PostgreSQL** مع لوحة إدارة عربية، توجيه متعدد لمزودي الذكاء الاصطناعي، بحث ويب، توليد/تحليل الصور، تحليل الملفات، وقياس الاستخدام والتكلفة.

> **تنبيه:** Baileys مكتبة غير رسمية تستخدم بروتوكول WhatsApp Web. لا يوجد ضمان من WhatsApp لاستمرار التوافق أو عدم تقييد الحساب. استخدم حسابًا مخصصًا، ولا تستخدم المشروع للسبام أو الإرسال الجماعي.

## الوظائف

- WhatsApp عبر Baileys مع QR داخل لوحة الإدارة وحالات Connected / Connecting / Disconnected.
- جلسة ثابتة في `/data/whatsapp` مناسبة لـ Railway Persistent Volume.
- Connect / Reconnect / Logout مع حذف Session عند تسجيل الخروج.
- Whitelist بصلاحيات `Chat / Search / Images / Files` وأدوار `Admin / User`.
- Daily Limit وMonthly Limit، مع Admin غير محدود.
- Conversation Memory منفصلة لكل مستخدم وأمر `/reset`.
- AI Router موحد: OpenAI وGemini وOpenRouter، مع نقطة توسعة لـ Anthropic.
- Search Adapter موحد: Tavily وSerper وBrave Search.
- توليد صور عبر مزود قابل للتبديل؛ OpenAI وGemini مدعومان بحسب النموذج الذي تختاره.
- Vision للصور المرسلة عبر OpenAI/Gemini/OpenRouter بحسب النموذج.
- ملفات PDF/TXT/DOCX مع تنظيف الملفات المؤقتة تلقائيًا.
- Usage logs لكل استدعاء API: provider/model/type/tokens/images/cost.
- لوحة عربية متجاوبة تعرض الإحصاءات والمستخدمين والمزودين والنماذج والإعدادات.
- تشفير مفاتيح API بـ AES-256-GCM، ولا يُحفظ أو يعرض إلا mask غير حساس بعد الحفظ.
- Admin session موقعة، CSRF، rate limiting، Helmet/CSP، Validation، وstructured logging مع redaction.
- Migrations قابلة للتتبع وتعمل تلقائيًا عند بدء الخدمة.
- `/health` مناسب لـ Railway Health Check.

## التشغيل محليًا

المتطلبات: Node.js 22+ وPostgreSQL.

```bash
cp .env.example .env
# عدّل القيم في .env
npm install
npm run typecheck
npm run lint
npm test
npm run build
npm start
```

افتح `http://localhost:3000/admin.html`.

## إعداد المزودين

1. افتح **المزودون** وأضف API Key لمزود AI واحد على الأقل.
2. أدخل أسعار المزود الحالية إن أردت تقدير التكلفة بدقة؛ لا يعتمد التطبيق على أسعار ثابتة داخل الكود.
3. أضف Tavily أو Serper أو Brave إذا أردت Web Search.
4. افتح **النماذج والإعدادات** وحدد Provider + Model لكل وظيفة:
   - Chat Model
   - Advanced Model
   - Vision Model
   - Search Model (نموذج تلخيص نتائج البحث)
   - Image Model
   - Search Provider (مزود نتائج الإنترنت)

أسماء النماذج Configuration وليست ثابتة داخل منطق WhatsApp، لأن توفر النماذج يتغير بين المزودين.

## أوامر WhatsApp الاختيارية

الاستخدام الطبيعي لا يحتاج أوامر. توجد أوامر مساعدة:

- `/help`
- `/search <query>`
- `/image <prompt>`
- `/model`
- `/usage`
- `/reset`

## Environment Variables

راجع `.env.example`. المتغيرات الأساسية:

- `DATABASE_URL`: رابط PostgreSQL.
- `DATABASE_SSL`: `true` فقط إذا كانت بيئة PostgreSQL تتطلب TLS بهذا النمط.
- `ADMIN_PASSWORD`: كلمة مرور قوية للوحة.
- `APP_ENCRYPTION_KEY`: سر لا يقل عن 32 حرفًا لتشفير API Keys. **لا تغيّره بعد حفظ مفاتيح إلا مع خطة تدوير**.
- `COOKIE_SECRET`: سر لا يقل عن 32 حرفًا لتوقيع جلسة الإدارة.
- `WHATSAPP_AUTH_DIR`: الافتراضي `/data/whatsapp`.
- `BOT_NAME`: اسم المساعد.
- `DEFAULT_DAILY_LIMIT`: الحد الافتراضي للمستخدم الجديد.
- `MAX_MEMORY_MESSAGES`: عدد رسائل الذاكرة القصيرة.
- `MAX_UPLOAD_BYTES`: أقصى حجم للوسائط/الملفات.
- `MAX_REQUESTS_PER_MINUTE`: rate limit إضافي لكل مستخدم WhatsApp.
- `WHATSAPP_AUTO_START`: عادة `true`؛ يمكن جعله `false` في CI أو بيئات الاختبار.
- `PORT`: Railway يمرره تلقائيًا؛ 3000 fallback محلي فقط.

لتوليد أسرار قوية:

```bash
openssl rand -base64 48
```

## النشر على Railway

1. اربط مستودع GitHub بخدمة Railway واحدة. يوجد `Dockerfile` production-ready و`railway.json` يضبط `/health`.
2. أضف Railway PostgreSQL واربط `DATABASE_URL` بخدمة التطبيق.
3. أضف **Persistent Volume** إلى خدمة التطبيق واجعل Mount Path هو `/data`.
4. أضف المتغيرات السرية المذكورة أعلاه. لا تضف API Keys الخاصة بمزودي AI إلى Railway Variables؛ أضفها من لوحة الإدارة كي تُحفظ مشفرة في PostgreSQL.
5. أنشئ Public Domain وافتح `/admin.html`.
6. من قسم WhatsApp اضغط Connect وامسح QR. بعد الربط ستبقى ملفات الجلسة داخل `/data/whatsapp` عبر restart/redeploy.
7. أضف المستخدمين، ثم المزودين، ثم حدد النماذج الافتراضية.

`/health` يرجع مثلًا:

```json
{
  "status": "ok",
  "whatsapp": "connected",
  "database": "connected"
}
```

حالة WhatsApp لا تجعل Health Check يفشل؛ قاعدة البيانات هي dependency اللازمة لاعتبار الخدمة جاهزة، لأن أول deploy يحتاج أن يعمل حتى قبل مسح QR.

## ملاحظات تشغيلية

- النسخة الأولى مصممة **لخدمة واحدة/Replica واحدة** لأن Session Baileys محفوظة على Volume محلي ولأن تسلسل طلبات المستخدم يتم داخل العملية. لا تفعّل horizontal replicas لنفس جلسة WhatsApp.
- ملفات المستخدم تذهب إلى مجلدات مؤقتة عشوائية وتُحذف في `finally`، ولا يُستخدم اسم الملف القادم من WhatsApp لبناء مسار مباشر.
- البحث يمرر نصوص المصادر إلى النموذج ثم يضيف الروابط الحقيقية من Search Adapter بشكل deterministic؛ النموذج لا يُطلب منه اختراع روابط.
- Anthropic ظاهر كمسار توسعة مستقبلي، لكنه غير مفعّل عمدًا حتى تتم إضافة Adapter واختباره.
