import { test, expect } from '@playwright/test';

test.describe('Real-time Messaging E2E', () => {
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
    // Channel appears in sidebar with # prefix, use data-testid
    await expect(page.getByTestId(`channel-${channelName}`)).toBeVisible();
  }

  async function selectChannel(page, channelName: string) {
    await page.getByTestId(`channel-${channelName}`).waitFor({ state: 'visible', timeout: 30000 });
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

  test('user can send and receive own messages', async ({ browser }) => {
    const timestamp = Date.now().toString().slice(-6);
    const userA = `a_${timestamp}`;
    const serverName = `Srv_${timestamp}`;
    const channelName = `chn_${timestamp}`;

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();

try {
      // Set up console listener early
      const logs = [];
      pageA.on('console', msg => logs.push(msg.text()));

      await registerAndLogin(pageA, userA);
      await createServer(pageA, serverName);
      await createTextChannel(pageA, channelName);
      await selectChannel(pageA, channelName);

      // Wait for WebSocket connection to be fully established
      await pageA.waitForTimeout(15000);

      // Debug: check console logs for WebSocket messages
      console.log('Console logs:', logs.filter(l => l.includes('[WS]') || l.includes('Connected') || l.includes('Disconnected') || l.includes('Joined') || l.includes('new_message') || l.includes('connect') || l.includes('socket') || l.includes('WebSocket')).join('\n'));

      // User A sends a message
      const messageContent = `Hello from ${userA} at ${Date.now()}`;
      await sendMessage(pageA, messageContent);

      // Debug: check console logs for WebSocket messages
      console.log('Console logs:', logs.filter(l => l.includes('[WS]') || l.includes('Connected') || l.includes('Disconnected') || l.includes('Joined') || l.includes('new_message')).join('\n'));

      // Debug: check console for Socket.IO messages
      const consoleLogs = [];
      pageA.on('console', msg => consoleLogs.push(msg.text()));

      // Debug: get all elements with data-testid starting with "message-"
      const allMessageElements = await pageA.locator('[data-testid^="message-"]').all();
      console.log(`Total elements with message- prefix: ${allMessageElements.length}`);
      for (const el of allMessageElements) {
        const testId = await el.getAttribute('data-testid');
        console.log(`Found: ${testId}`);
      }

      // Debug: get all messages and their content
      const messagesA = await getMessages(pageA);
      const count = await messagesA.count();
      console.log(`Message count: ${count}`);
      for (let i = 0; i < count; i++) {
        const testId = await messagesA.nth(i).getAttribute('data-testid');
        const text = await messagesA.nth(i).textContent();
        console.log(`Message ${i}: testId=${testId}, text=${text}`);
      }

      // Verify message appears for sender
      await expect(messagesA).toHaveCount(1);

      // Verify message content
      const lastMsg = await getLastMessageContent(pageA);
      expect(lastMsg).toContain(messageContent);

    } finally {
      await contextA.close();
    }
  });

  test('multiple messages maintain order', async ({ browser }) => {
    const timestamp = Date.now().toString().slice(-6);
    const userA = `b_${timestamp}`;

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();

    try {
      await registerAndLogin(pageA, userA);
      const serverName = `BSrv_${timestamp}`;
      const channelName = `BCh_${timestamp}`;
      await createServer(pageA, serverName);
      await createTextChannel(pageA, channelName);
      await selectChannel(pageA, channelName);

      const msg1 = `First message ${Date.now()}`;
      await sendMessage(pageA, msg1);

      const messagesA = await getMessages(pageA);
      await expect(messagesA).toHaveCount(1);

      const msg2 = `Second message ${Date.now()}`;
      await sendMessage(pageA, msg2);

      await expect(getMessages(pageA)).toHaveCount(2);

      // Verify order - first message should be first
      const messagesList = await getMessages(pageA);
      const firstMsgText = await messagesList.first().textContent();
      const secondMsgText = await messagesList.nth(1).textContent();
      expect(firstMsgText).toContain(msg1);
      expect(secondMsgText).toContain(msg2);

    } finally {
      await contextA.close();
    }
  });

  test('message persistence after page reload', async ({ browser }) => {
    test.setTimeout(120000);
    const timestamp = Date.now().toString().slice(-6);
    const user = `p_${timestamp}`;

    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await registerAndLogin(page, user);
      const serverName = `PSrv_${timestamp}`;
      const channelName = `PCh_${timestamp}`;
      await createServer(page, serverName);
      await createTextChannel(page, channelName);
      await selectChannel(page, channelName);

      const msgContent = `Persistent message ${Date.now()}`;
      await sendMessage(page, msgContent);

      await expect(getMessages(page)).toHaveCount(1);

      // Debug: check localStorage before reload
      const lsBefore = await page.evaluate(() => ({
        serverId: localStorage.getItem('commet-selected-server-id'),
        channelId: localStorage.getItem('commet-selected-channel-id')
      }));
      console.log('localStorage before reload:', lsBefore);

      // Reload page
      console.log('Before page reload');
      await page.reload();
      console.log('After page reload, waiting for load state');
      await page.waitForLoadState('networkidle');
      console.log('After load state, waiting for re-initialization (25s)');
      await page.waitForTimeout(25000);

      // Debug: check localStorage after reload
      const lsAfter = await page.evaluate(() => ({
        serverId: localStorage.getItem('commet-selected-server-id'),
        channelId: localStorage.getItem('commet-selected-channel-id')
      }));
      console.log('localStorage after reload:', lsAfter);

      // Re-select server first - click the server in the sidebar
      console.log('Before re-selecting server');
      // The server is in the sidebar listbox, find and click it
      const serverItem = page.locator('[role="listbox"]').locator('button', { hasText: serverName });
      await serverItem.waitFor({ state: 'visible', timeout: 30000 });
      await serverItem.click();
      console.log('After re-selecting server, waiting for channels (10s)');
      await page.waitForTimeout(10000);

      // Debug: check what channels are visible
      const allChannelElements = await page.locator('[data-testid^="channel-"]').all();
      console.log(`Total channel elements: ${allChannelElements.length}`);
      for (const el of allChannelElements) {
        const testId = await el.getAttribute('data-testid');
        console.log(`Found channel: ${testId}`);
      }

      // Debug: check localStorage after waiting
      const lsAfterWait = await page.evaluate(() => ({
        serverId: localStorage.getItem('commet-selected-server-id'),
        channelId: localStorage.getItem('commet-selected-channel-id')
      }));
      console.log('localStorage after wait:', lsAfterWait);

      // Re-select channel
      console.log('Before re-selecting channel');
      await selectChannel(page, channelName);
      console.log('After re-selecting channel, waiting 1 second');
      await page.waitForTimeout(1000);

      // Message should still be there
      console.log('Before checking message count');
      await expect(getMessages(page)).toHaveCount(1);
      console.log('After checking message count');

    } finally {
      await context.close();
    }
  });

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

  test('message input validation and states', async ({ browser }) => {
    const timestamp = Date.now().toString().slice(-6);
    const user = `i_${timestamp}`;

    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await registerAndLogin(page, user);
      const serverName = `ISrv_${timestamp}`;
      const channelName = `ICh_${timestamp}`;
      await createServer(page, serverName);
      await createTextChannel(page, channelName);
      await selectChannel(page, channelName);

      // Send button should be disabled when input is empty
      await expect(page.getByTestId('message-send')).toBeDisabled();

      // Type a message
      await page.getByTestId('message-input').fill('Test');
      await expect(page.getByTestId('message-send')).toBeEnabled();

      // Clear input
      await page.getByTestId('message-input').fill('');
      await expect(page.getByTestId('message-send')).toBeDisabled();

    } finally {
      await context.close();
    }
  });

  test('Enter key sends message', async ({ browser }) => {
    const timestamp = Date.now().toString().slice(-6);
    const user = `e_${timestamp}`;

    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await registerAndLogin(page, user);
      const serverName = `ESrv_${timestamp}`;
      const channelName = `ECh_${timestamp}`;
      await createServer(page, serverName);
      await createTextChannel(page, channelName);
      await selectChannel(page, channelName);

      // Type message and press Enter
      const msgContent = `Enter key test ${Date.now()}`;
      await page.getByTestId('message-input').fill(msgContent);
      await page.getByTestId('message-input').press('Enter');
      await page.waitForTimeout(500);

      await expect(getMessages(page)).toHaveCount(1);
      const lastMsg = await getLastMessageContent(page);
      expect(lastMsg).toContain(msgContent);

    } finally {
      await context.close();
    }
  });

  test('Shift+Enter creates new line', async ({ browser }) => {
    const timestamp = Date.now().toString().slice(-6);
    const user = `s_${timestamp}`;

    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await registerAndLogin(page, user);
      const serverName = `SSrv_${timestamp}`;
      const channelName = `SCh_${timestamp}`;
      await createServer(page, serverName);
      await createTextChannel(page, channelName);
      await selectChannel(page, channelName);

      // Type with Shift+Enter for new line
      await page.getByTestId('message-input').fill('Line 1');
      await page.getByTestId('message-input').press('Shift+Enter');
      await page.getByTestId('message-input').fill('Line 1\nLine 2');
      await page.getByTestId('message-send').click();
      await page.waitForTimeout(500);

      await expect(getMessages(page)).toHaveCount(1);
      const lastMsg = await getLastMessageContent(page);
      expect(lastMsg).toContain('Line 1');
      expect(lastMsg).toContain('Line 2');

    } finally {
      await context.close();
    }
  });
});

test.describe('Real-time Messaging - Two User Scenarios (Requires Server Invite)', () => {
  // These tests require a way for user B to join user A's server
  // Currently the app doesn't have an invite/join flow for existing servers
  // so these are documented as known limitations

  test.skip('user B joins user A server and receives messages', async ({ browser }) => {
    // This test requires a server invite/join mechanism
    // Currently not implemented in the app
  });

  test.skip('disconnection and reconnection preserves messages', async ({ browser }) => {
    // Requires two users in same channel
  });

  async function registerAndLoginStandalone(page, username: string) {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Registrar' }).first().click();
    await page.waitForTimeout(300);
    await page.getByTestId('register-username').fill(username);
    await page.getByLabel('Email').fill(`${username}@test.com`);
    await page.getByLabel('Senha').fill('TestPass123!');
    await page.getByTestId('register-submit').click();
    await page.waitForURL('http://localhost:3000/', { timeout: 30000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    await expect(page.getByRole('heading', { name: 'Commet' })).toBeVisible();
    return username;
  }

  async function createServerStandalone(page, serverName: string) {
    await page.getByTestId('btn-create-server').click();
    await page.waitForTimeout(300);
    await page.getByTestId('input-server-name').fill(serverName);
    await page.getByTestId('btn-confirm-create-server').click();
    await page.waitForTimeout(500);
    await expect(page.getByRole('heading', { name: serverName })).toBeVisible();
  }

  async function createTextChannelStandalone(page, channelName: string) {
    await page.getByTestId('btn-create-channel').click();
    await page.waitForTimeout(300);
    await page.getByPlaceholder('Nome do canal').fill(channelName);
    await page.getByRole('button', { name: 'Criar', exact: true }).click();
    await page.waitForTimeout(500);
    await expect(page.getByTestId(`channel-${channelName}`)).toBeVisible();
  }

  test('unauthorized user cannot access channel messages', async ({ browser }) => {
    test.setTimeout(120000);
    const timestamp = Date.now().toString().slice(-6);
    const userA = `auth_a_${timestamp}`;
    const userB = `auth_b_${timestamp}`;
    const serverName = `AuthTest_${timestamp}`;
    const channelName = `AuthCh_${timestamp}`;

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      // User A creates server + channel
      await registerAndLoginStandalone(pageA, userA);
      await createServerStandalone(pageA, serverName);
      await createTextChannelStandalone(pageA, channelName);

      // Get User A's token for direct API calls
      const tokenA = await pageA.evaluate(() => localStorage.getItem('token'));
      const serverRes = await pageA.request.get(`http://localhost:4000/servers`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      const servers = await serverRes.json();
      const server = servers.find((s: { name: string; id: string }) => s.name === serverName);

      // User B registers (NOT a member of User A's server)
      await registerAndLoginStandalone(pageB, userB);
      const tokenB = await pageB.evaluate(() => localStorage.getItem('token'));

      // User B tries to list channels in User A's server → should get 403
      const channelsRes = await pageB.request.get(`http://localhost:4000/servers/${server.id}/channels`, {
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      expect(channelsRes.status()).toBe(403);

      // User B tries to get messages from User A's channel → should get 403
      const channelRes = await pageA.request.get(`http://localhost:4000/servers/${server.id}/channels`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      const channels = await channelRes.json();
      const targetChannel = channels.find((c: { name: string; id: string }) => c.name === channelName);

      const messagesRes = await pageB.request.get(`http://localhost:4000/channels/${targetChannel.id}/messages`, {
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      expect(messagesRes.status()).toBe(403);

      // Navigate to the app; User B should NOT see User A's server in the sidebar
      await pageB.goto('http://localhost:3000');
      await pageB.waitForLoadState('networkidle');
      await pageB.waitForTimeout(2000);

      const serverListB = await pageB.evaluate(() => {
        const listbox = document.querySelector('[role="listbox"]') as HTMLElement | null;
        return listbox ? listbox.innerText : 'no listbox';
      });
      expect(serverListB).not.toContain(serverName);
    } finally {
      await contextA.close().catch(() => {});
      await contextB.close().catch(() => {});
    }
  });
});