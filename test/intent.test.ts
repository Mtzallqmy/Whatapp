import test from 'node:test'
import assert from 'node:assert/strict'
import { detectIntent } from '../src/ai/intent.js'

test('detects natural Arabic search requests', () => {
  assert.equal(detectIntent('ابحث لي عن آخر أخبار الذكاء الاصطناعي'), 'search')
  assert.equal(detectIntent('ما آخر أخبار السوق اليوم؟'), 'search')
})

test('detects image generation requests', () => {
  assert.equal(detectIntent('صمم لي صورة إعلان لمقهى يمني'), 'image')
  assert.equal(detectIntent('/image بوستر بسيط'), 'image')
})

test('keeps normal questions as chat', () => {
  assert.equal(detectIntent('اشرح لي الفرق بين PostgreSQL و MySQL'), 'chat')
})
