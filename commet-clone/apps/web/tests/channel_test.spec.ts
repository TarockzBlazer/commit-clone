import { test, expect } from '@playwright/test';

test.describe('Channel Message Test', () => {
  const baseURL = 'http://localhost:3000';

  async function registerAndLogin(page, username: string) {
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Registrar' }).first().click();
    await page.waitForTimeout(300);

    await page.getByTestId('register-username').fill(username);
    await page.getByLabel('Email').fill(`${username}@test.com`);
    await page.getByLabel('Senha').fill('TestPass123!');
    await page.getByTestId('register-submit').click();

    await page.waitForURL(baseURL + '/', { timeout: 30000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    await expect(page.getByRole('heading', { name: 'Commet' })).toBeVisible();
    return username;
  }

  async function createServer(page, serverName: string) {
    await page.getByTestId('btn-create-server').click();
    await page.waitForTimeout(300);
    await page.getByTestId('input-server-name').fill(serverName);
    await page.getByTestId('btn-confirm-create-server').click();
    await page.waitForTimeout(500);
    await expect(page.getByRole('heading', { name: serverName })).toBeVisible();
  }

  async function createTextChannel(page, channelName: string) {
    await page.getByTestId('btn-create-channel').click();
    await page.waitForTimeout(300);
    await page.getByPlaceholder('Nome do canal').fill(channelName);
    await page.getByRole('button', { name: 'Criar', exact: true }).click();
    await page.waitForTimeout(500);
    await expect(page.getByTestId(`channel-${channelName}`)).toBeVisible();
  }

  async function selectChannel(page, channelName: string) {
    await page.getByTestId(`channel-${channelName}`).click();
    await page.waitForTimeout(500);
  }

  async function sendMessage(page, content: string) {
    await page.getByTestId('message-input').fill(content);
    await page.getByTestId('message-send').click();
    await page.waitForTimeout(1000);
  }

  function getMessages(page) {
    // Match message IDs (cuid format starts with 'c')
    // Exclude message-input and message-send
    return page.locator('[data-testid^="message-c"]');
  }

  async function getLastMessageContent(page) {
    const messages = getMessages(page);
    const count = await messages.count();
    if (count === 0) return null;
    return messages.nth(count - 1).textContent();
  }

  test('messages stay in correct channel', async ({ browser }) => {
    const timestamp = Date.now().toString().slice(-6);
    const user = `c_${timestamp}`;

    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await registerAndLogin(page, user);
      const serverName = `CSrv_${timestamp}`;
      const channel1 = `C1_${timestamp}`;
      const channel2 = `C2_${timestamp}`;
      await createServer(page, serverName);
      await createTextChannel(page, channel1);
      await createTextChannel(page, channel2);

      // Send message in channel 1
      await selectChannel(page, channel1);
      await sendMessage(page, `Message in ${channel1}`);

      // Debug: check what messages we have
      const allMessageElements = await page.locator('[data-testid^="message-"]').all();
      console.log(`Total elements with message- prefix: ${allMessageElements.length}`);
      for (const el of allMessageElements) {
        const testId = await el.getAttribute('data-testid');
        console.log(`Found: ${testId}`);
      }

      const messagesA = await getMessages(page);
      const count = await messagesA.count();
      console.log(`Message count (message-c): ${count}`);
      for (let i = 0; i < count; i++) {
        const testId = await messagesA.nth(i).getAttribute('data-testid');
        const text = await messagesA.nth(i).textContent();
        console.log(`Message ${i}: testId=${testId}, text=${text}`);
      }

      await expect(getMessages(page)).toHaveCount(1);

      // Switch to channel 2
      await selectChannel(page, channel2);
      await expect(getMessages(page)).toHaveCount(0);

      // Send message in channel 2
      await sendMessage(page, `Message in ${channel2}`);
      await expect(getMessages(page)).toHaveCount(1);

    } finally {
      await context.close();
    }
  });
});
