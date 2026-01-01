/**
 * Test helper script to compute expected webhook signature
 * 
 * Usage:
 *   META_APP_SECRET=your_secret npx tsx scripts/test-webhook-signature.ts '{"entry": [{"id": "0"}]}'
 * 
 * Or set META_APP_SECRET in .env.local and run:
 *   npx tsx scripts/test-webhook-signature.ts '{"entry": [{"id": "0"}]}'
 * 
 * This helps verify that META_APP_SECRET is correct by computing
 * the expected signature for a known payload.
 */

import crypto from 'crypto'

const payloadString = process.argv[2] || '{"entry": [{"id": "0", "time": 1767306476}]}'
const appSecret = process.env.META_APP_SECRET

if (!appSecret) {
  console.error('Error: META_APP_SECRET not found in environment variables')
  console.error('Make sure .env.local contains META_APP_SECRET=...')
  process.exit(1)
}

console.log('Computing signature for payload:')
console.log(payloadString)
console.log('')

const rawBody = Buffer.from(payloadString, 'utf8')
const signature = crypto
  .createHmac('sha256', appSecret)
  .update(rawBody)
  .digest('hex')

console.log('Expected signature:')
console.log(`sha256=${signature}`)
console.log('')
console.log('Payload byte length:', rawBody.length)
console.log('Secret length:', appSecret.length)
console.log('')
console.log('To verify:')
console.log('1. Use Meta "Test" button in Webhooks dashboard')
console.log('2. Compare the X-Hub-Signature-256 header with the signature above')
console.log('3. If they match, META_APP_SECRET is correct')
console.log('4. If they differ, check that META_APP_SECRET matches Meta App Dashboard → Settings → Basic → App Secret')

