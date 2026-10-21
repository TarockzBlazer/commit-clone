import { test, expect } from '@playwright/test';

test.describe('Invite API Validation', () => {
  test('validate endpoint rejects invalid invite codes', async ({ request }) => {
    const response = await request.post('http://localhost:4000/invites/validate', {
      data: { code: 'WRONG123' },
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });

    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.message).toBe('Invite not found');
  });

  test('validate endpoint accepts valid invite codes', async ({ request }) => {
    // This test would need a valid invite code, which requires setting up a server and invite first
    test.skip(true, 'Requires valid invite setup');
  });
});