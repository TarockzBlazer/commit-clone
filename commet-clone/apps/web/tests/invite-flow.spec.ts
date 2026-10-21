import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

test.describe('Real-time Messaging - Two User Invite Flow', () => {
  const baseURL = 'http://localhost:3000';
  const API_URL = 'http://localhost:4000';

  // SQLite database of the API (__dirname is apps/web/tests; ../../ = apps/)
  const DB_PATH = join(__dirname, '../../api/prisma/dev.db');

  async function tokenOf(page) {
    return await page.evaluate(() => localStorage.getItem('token'));
  }

  function dbRun(sql: string) {
    // Usar o CLI sqlite3 via arquivo temporário para evitar conflito de bloqueio
    // de arquivo com a API (que já tem o banco aberto via Prisma) e problemas
    // de escaping de aspas no shell
    const tmpFile = join(tmpdir(), `invite-test-${Date.now()}.sql`);
    writeFileSync(tmpFile, sql);
    try {
      execSync(`sqlite3 "${DB_PATH}" < "${tmpFile}"`, { stdio: 'pipe' });
    } finally {
      unlinkSync(tmpFile);
    }
  }

  async function getServerId(page, serverName: string): Promise<string | null> {
    const token = await tokenOf(page);
    const res = await page.request.get(`${API_URL}/servers`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const servers = await res.json();
    const server = servers.find((s: { name: string; id: string }) => s.name === serverName);
    return server ? server.id : null;
  }

  async function userIdOf(page): Promise<string> {
    const token = await tokenOf(page);
    const res = await page.request.get(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const me = await res.json();
    return me.id;
  }

  async function registerAndLogin(page, username: string) {
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

  async function createInvite(page) {
    await page.getByTestId('btn-create-invite').click();
    await page.waitForTimeout(500);
    // Wait for modal to appear
    await page.getByText('Convite Criado').waitFor({ state: 'visible', timeout: 10000 });
    // Get the invite link from the input
    const inviteLink = await page.locator('input[readOnly]').inputValue();
    await page.getByRole('button', { name: 'Fechar' }).click();
    await page.waitForTimeout(300);
    return inviteLink;
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

  async function getMessages(page) {
    return page.locator('[data-testid^="message-c"]');
  }

  async function getLastMessageContent(page) {
    const messages = await getMessages(page);
    const count = await messages.count();
    if (count === 0) return null;
    return messages.nth(count - 1).textContent();
  }

  async function selectServer(page, serverName: string) {
    // Find and click the server in the sidebar
    const serverItem = page.locator('[role="listbox"]').locator('button', { hasText: serverName });
    await serverItem.waitFor({ state: 'visible', timeout: 10000 });
    await serverItem.click();
    await page.waitForTimeout(1000);
  }

  test('User A creates invite and User B joins via invite code', async ({ browser }) => {
    test.setTimeout(120000);
    const timestamp = Date.now().toString().slice(-6);
    const userA = `invite_a_${timestamp}`;
    const userB = `invite_b_${timestamp}`;
    const serverName = `InviteTest_${timestamp}`;
    const channelName = `general_${timestamp}`;

    // Use separate browser contexts for each user to avoid session sharing
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      // User A registers and creates server/channel
      await registerAndLogin(pageA, userA);
      await createServer(pageA, serverName);
      await createTextChannel(pageA, channelName);
      await selectChannel(pageA, channelName);

      // User A creates an invite
      const inviteLink = await createInvite(pageA);
      const inviteCode = inviteLink.split('/invites/')[1];

      // User B goes to auth page (not logged in) and joins via invite
      await pageB.goto('http://localhost:3000');
      await pageB.waitForLoadState('networkidle');

      // User B clicks "Entrar via convite" on auth page
      await pageB.getByRole('button', { name: 'Entrar via convite' }).click();
      await pageB.waitForTimeout(300);

      // User B enters the invite code
      await pageB.locator('input[placeholder="Código do convite (ex: ABC123XY)"]').fill(inviteCode);
      await pageB.getByRole('button', { name: 'Validar e continuar' }).click();

      // Wait for invite validation
      await pageB.waitForTimeout(5000);

      // Now User B registers (after invite validation)
      await pageB.getByRole('button', { name: 'Registrar' }).first().click();
      await pageB.waitForTimeout(300);

      await pageB.getByTestId('register-username').fill(userB);
      await pageB.getByLabel('Email').fill(`${userB}@test.com`);
      await pageB.getByLabel('Senha').fill('TestPass123!');
      await pageB.getByTestId('register-submit').click();

      // Wait for redirect to app after login (auto-join happens in handleLoginSuccess)
      await pageB.waitForURL('http://localhost:3000/', { timeout: 30000 });
      await pageB.waitForLoadState('networkidle');
      await pageB.waitForTimeout(10000);

      // Verify User B can see the server
      await expect(pageB.getByRole('heading', { name: serverName })).toBeVisible({ timeout: 10000 });

      // User B selects the server and channel
      await selectServer(pageB, serverName);
      await selectChannel(pageB, channelName);

      // Verify User B is in the channel view (message input present)
      await expect(pageB.getByTestId('message-input')).toBeVisible({ timeout: 10000 });

      // Wait for WebSocket to join channel
      await pageB.waitForTimeout(10000);

      // User A sends a message
      const messageFromA = `Hello from ${userA} at ${Date.now()}`;
      await sendMessage(pageA, messageFromA);
      await pageA.waitForTimeout(5000);

      // Verify User A sees their own message
      const messagesA = await getMessages(pageA);
      await expect(messagesA).toHaveCount(1);
      const lastMsgA = await getLastMessageContent(pageA);
      expect(lastMsgA).toContain(messageFromA);

      // Verify User B receives the message in real-time
      await pageB.waitForTimeout(5000);
      const messagesB = await getMessages(pageB);
      await expect(messagesB).toHaveCount(1);
      const lastMsgB = await getLastMessageContent(pageB);
      expect(lastMsgB).toContain(messageFromA);

      // User B replies
      const messageFromB = `Hello from ${userB} at ${Date.now()}`;
      await sendMessage(pageB, messageFromB);
      await pageB.waitForTimeout(1000);

      // Verify User B sees their own message
      const messagesB2 = await getMessages(pageB);
      await expect(messagesB2).toHaveCount(2);
      const lastMsgB2 = await getLastMessageContent(pageB);
      expect(lastMsgB2).toContain(messageFromB);

      // Verify User A receives the reply in real-time
      await pageA.waitForTimeout(2000);
      const messagesA2 = await getMessages(pageA);
      await expect(messagesA2).toHaveCount(2);
      const lastMsgA2 = await getLastMessageContent(pageA);
      expect(lastMsgA2).toContain(messageFromB);

    } finally {
      await contextA.close().catch(() => {});
      await contextB.close().catch(() => {});
    }
  });

  test('User B cannot join with invalid invite code', async ({ browser }) => {
    test.setTimeout(120000);
    const timestamp = Date.now().toString().slice(-6);
    const userA = `invalid_a_${timestamp}`;
    const userB = `invalid_b_${timestamp}`;

    // Use separate browser contexts for each user to avoid session sharing
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      // User A registers and creates server/channel
      await registerAndLogin(pageA, userA);
      const serverName = `InvalidTest_${Date.now()}`;
      const channelName = `general_${timestamp}`;
      await createServer(pageA, serverName);
      await createTextChannel(pageA, channelName);

      // User A creates an invite (not strictly needed for invalid code, but keeps setup consistent)
      const inviteLink = await createInvite(pageA);

      // User B (not logged in) goes to the auth page and tries an invalid code
      await pageB.goto(baseURL);
      await pageB.waitForLoadState('networkidle');

      await pageB.getByRole('button', { name: 'Entrar via convite' }).click();
      await pageB.waitForTimeout(300);
      await pageB.locator('input[placeholder="Código do convite (ex: ABC123XY)"]').fill('WRONG123');
      await pageB.getByRole('button', { name: 'Validar e continuar' }).click();
      await pageB.waitForTimeout(5000);

      // Should show error
      const errorVisible = await pageB.locator('text=Invite not found').isVisible({ timeout: 10000 });
      expect(errorVisible).toBeTruthy();

    } finally {
      await contextA.close().catch(() => {});
      await contextB.close().catch(() => {});
    }
  });

  test('User B cannot join with expired invite', async ({ browser }) => {
    test.setTimeout(120000);
    const timestamp = Date.now().toString().slice(-6);
    const userA = `exp_a_${timestamp}`;
    const userB = `exp_b_${timestamp}`;

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();

    try {
      // User A registers via API and creates a server
      const regRes = await pageB.request.post(`${API_URL}/auth/register`, {
        data: { username: userA, email: `${userA}@test.com`, password: 'TestPass123!' },
      });
      expect(regRes.ok).toBeTruthy();
      const regBody = await regRes.json();
      const tokenA = regBody.token;

      const serverRes = await pageB.request.post(`${API_URL}/servers`, {
        data: { name: `ExpiredTest_${timestamp}` },
        headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      });
      expect(serverRes.ok).toBeTruthy();
      const serverBody = await serverRes.json();
      const serverId = serverBody.id;

      // Get User A's ID for the creatorId
      const meRes = await pageB.request.get(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      expect(meRes.ok).toBeTruthy();
      const meBody = await meRes.json();
      const creatorId = meBody.id;

      // Insert an expired invite directly into the database
      const expiredCode = `EXPIRED${timestamp}`;
      const past = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago
      const inviteId = `cuid_expired_${timestamp}`;
      const sql = `INSERT INTO "Invite" (id, code, serverId, creatorId, maxUses, currentUses, expiresAt, createdAt) VALUES ('${inviteId}', '${expiredCode}', '${serverId}', '${creatorId}', 100, 0, '${past}', '${past}')`;
      dbRun(sql);

      // User B (not logged in) tries to join with the expired invite
      await pageB.goto(baseURL);
      await pageB.waitForLoadState('networkidle');

      await pageB.getByRole('button', { name: 'Entrar via convite' }).click();
      await pageB.waitForTimeout(300);
      await pageB.locator('input[placeholder="Código do convite (ex: ABC123XY)"]').fill(expiredCode);
      await pageB.getByRole('button', { name: 'Validar e continuar' }).click();
      await pageB.waitForTimeout(5000);

      // Backend confirma que o convite expirado é rejeitado com 400
      const valRes = await pageB.request.post(`${API_URL}/invites/validate`, {
        data: { code: expiredCode },
        headers: { 'Content-Type': 'application/json' },
      });
      expect(valRes.status()).toBe(400);
      const valBody = await valRes.json();
      expect(valBody.message).toBe('Invite has expired');

      // UI: usuário permanece na página de auth (validação falhou, nenhum redirecionamento)
      await expect(pageB).toHaveURL(/localhost:3000/);
    } finally {
      await contextB.close().catch(() => {});
    }
  });

  test('Invite usage limit is enforced', async ({ browser }) => {
    test.setTimeout(120000);
    const timestamp = Date.now().toString().slice(-6);
    const userA = `lim_a_${timestamp}`;
    const userB = `lim_b_${timestamp}`;
    const userC = `lim_c_${timestamp}`;

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const contextC = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    const pageC = await contextC.newPage();

    try {
      // User A registers and creates a server
      await registerAndLogin(pageA, userA);
      const serverName = `LimitTest_${timestamp}`;
      await createServer(pageA, serverName);

      // User A creates an invite with maxUses=1 via API
      const serverId = await getServerId(pageA, serverName);
      expect(serverId).not.toBeNull();
      const token = await tokenOf(pageA);
      const createRes = await pageA.request.post(`${API_URL}/servers/${serverId}/invites`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        data: { maxUses: 1 },
      });
      expect(createRes.ok).toBeTruthy();
      const invite = await createRes.json();
      const inviteCode = invite.code;

      // Helper: join via invite (not logged in flow: validate then register)
      const joinViaInvite = async (page, username) => {
        await page.goto(baseURL);
        await page.waitForLoadState('networkidle');
        await page.getByRole('button', { name: 'Entrar via convite' }).click();
        await page.waitForTimeout(300);
        await page.locator('input[placeholder="Código do convite (ex: ABC123XY)"]').fill(inviteCode);
        await page.getByRole('button', { name: 'Validar e continuar' }).click();
        await page.waitForTimeout(5000);

        await page.getByRole('button', { name: 'Registrar' }).first().click();
        await page.waitForTimeout(300);
        await page.getByTestId('register-username').fill(username);
        await page.getByLabel('Email').fill(`${username}@test.com`);
        await page.getByLabel('Senha').fill('TestPass123!');
        await page.getByTestId('register-submit').click();
        await page.waitForURL(baseURL + '/', { timeout: 30000 });
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(3000);
      };

      // User B consumes the single use of the invite
      await joinViaInvite(pageB, userB);

      // User C tries to use the same invite after maxUses was reached
      await pageC.goto(baseURL);
      await pageC.waitForLoadState('networkidle');
      await pageC.getByRole('button', { name: 'Entrar via convite' }).click();
      await pageC.waitForTimeout(300);
      await pageC.locator('input[placeholder="Código do convite (ex: ABC123XY)"]').fill(inviteCode);
      await pageC.getByRole('button', { name: 'Validar e continuar' }).click();
      await pageC.waitForTimeout(5000);

      // Should show max-uses error (validate is public and checks maxUses)
      const errorVisible = await pageC.locator('text=Invite has reached maximum uses').isVisible({ timeout: 10000 });
      expect(errorVisible).toBeTruthy();
    } finally {
      await contextA.close().catch(() => {});
      await contextB.close().catch(() => {});
      await contextC.close().catch(() => {});
    }
  });

  test('User cannot join same server twice', async ({ browser }) => {
    test.setTimeout(120000);
    const timestamp = Date.now().toString().slice(-6);
    const userA = `dup_a_${timestamp}`;
    const userB = `dup_b_${timestamp}`;
    const serverName = `DupTest_${timestamp}`;

    // Use separate browser contexts for each user to avoid session sharing
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      // User A registers and creates a server + channel
      await registerAndLogin(pageA, userA);
      await createServer(pageA, serverName);
      await createTextChannel(pageA, `general_${timestamp}`);

      // User A creates an invite via UI
      const inviteLink = await createInvite(pageA);
      const inviteCode = inviteLink.split('/invites/')[1];

      // User B (not logged in) joins via invite: validate then register
      await pageB.goto(baseURL);
      await pageB.waitForLoadState('networkidle');
      await pageB.getByRole('button', { name: 'Entrar via convite' }).click();
      await pageB.waitForTimeout(300);
      await pageB.locator('input[placeholder="Código do convite (ex: ABC123XY)"]').fill(inviteCode);
      await pageB.getByRole('button', { name: 'Validar e continuar' }).click();
      await pageB.waitForTimeout(5000);

      await pageB.getByRole('button', { name: 'Registrar' }).first().click();
      await pageB.waitForTimeout(300);
      await pageB.getByTestId('register-username').fill(userB);
      await pageB.getByLabel('Email').fill(`${userB}@test.com`);
      await pageB.getByLabel('Senha').fill('TestPass123!');
      await pageB.getByTestId('register-submit').click();
      await pageB.waitForURL(baseURL + '/', { timeout: 30000 });
      await pageB.waitForLoadState('networkidle');
      await pageB.waitForTimeout(3000);

      // User B is now a member: server is visible
      await expect(pageB.getByRole('heading', { name: serverName })).toBeVisible({ timeout: 10000 });

      // Trying to accept the same invite again (authenticated as User B) -> duplicate rejected
      const tokenB = await tokenOf(pageB);
      const dupRes = await pageB.request.post(`${API_URL}/invites/accept`, {
        headers: {
          Authorization: `Bearer ${tokenB}`,
          'Content-Type': 'application/json',
        },
        data: { code: inviteCode },
      });
      expect(dupRes.status()).toBe(400);
      const dupBody = await dupRes.json();
      expect(dupBody.message).toBe('Already a member of this server');

      // No duplicate membership: User B appears exactly once in the server members
      const serverId = await getServerId(pageA, serverName);
      expect(serverId).not.toBeNull();
      const serverRes = await pageA.request.get(`${API_URL}/servers/${serverId}`, {
        headers: { Authorization: `Bearer ${await tokenOf(pageA)}` },
      });
      const server = await serverRes.json();
      const userBId = await userIdOf(pageB);
      const memberships = (server.members || []).filter((m: { userId: string }) => m.userId === userBId);
      expect(memberships.length).toBe(1);
    } finally {
      await contextA.close().catch(() => {});
      await contextB.close().catch(() => {});
    }
  });
});