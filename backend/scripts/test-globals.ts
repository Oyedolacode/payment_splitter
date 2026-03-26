import { AbortController } from 'node:abort-controller';
// Simulate qboRequest logic
async function test() {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 1000)
  try {
    console.log('Testing fetch or global scope...')
    // Check if fetch is available
    if (typeof fetch === 'undefined') {
      console.log('fetch is UNDEFINED')
    } else {
      console.log('fetch is DEFINED')
    }
  } catch (e) {
    console.error('Test failed:', e)
  } finally {
    clearTimeout(timeoutId)
  }
}
test()
