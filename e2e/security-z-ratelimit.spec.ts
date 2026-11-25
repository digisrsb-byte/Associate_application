import { test, expect } from '@playwright/test';
import { E2E_EMAIL } from './helpers/auth';

/**
 * Runs last (filename z-*). Exhausts forgot-password rate limit (5 / 15 min).
 * Keep after other Stage 5 auth tests that need forgot-password.
 */
test.describe('Stage 5A — rate limiting', () => {
  test('forgot-password returns 429 after burst', async ({ page }) => {
    let saw429 = false;
    for (let i = 0; i < 8; i++) {
      const res = await page.request.post('/api/auth/forgot-password', {
        data: { email: E2E_EMAIL },
      });
      if (res.status() === 429) {
        saw429 = true;
        const body = await res.json();
        expect(String(body.error || '')).toMatch(/too many/i);
        break;
      }
      expect(res.ok()).toBeTruthy();
    }
    expect(saw429).toBeTruthy();
  });
});
