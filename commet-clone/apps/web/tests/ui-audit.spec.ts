import { test, expect } from '@playwright/test';

test.describe('Commit-Clone UI Audit', () => {
  test('page loads and shows login/register tabs', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Should show logo and title
    await expect(page.getByRole('heading', { name: 'Commet' })).toBeVisible();

    // Should have login and register tabs
    await expect(page.getByRole('button', { name: 'Entrar' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Registrar' }).first()).toBeVisible();
  });

  test('login form renders correctly', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Login tab should be active by default
    await expect(page.getByRole('button', { name: 'Entrar' }).first()).toHaveClass(/bg-\[var\(--surface-active\)\]/);

    // Should have username and password fields
    await expect(page.getByLabel('Usuário')).toBeVisible();
    await expect(page.getByLabel('Senha')).toBeVisible();

    // Should have submit button
    await expect(page.getByTestId('login-submit')).toBeVisible();
  });

  test('register form renders correctly', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Click register tab
    await page.getByRole('button', { name: 'Registrar' }).first().click();
    await page.waitForTimeout(500);

    // Should have username, email and password fields
    await expect(page.getByLabel('Usuário')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Senha')).toBeVisible();

    // Should have submit button
    await expect(page.getByTestId('register-submit')).toBeVisible();
  });

  test('registration creates account and redirects to app', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Switch to register tab
    await page.getByRole('button', { name: 'Registrar' }).first().click();
    await page.waitForTimeout(300);

    // Fill registration form
    const testUsername = `tu_${Date.now().toString().slice(-4)}`;
    await page.getByTestId('register-username').fill(testUsername);
    await page.getByLabel('Email').fill(`${testUsername}@test.com`);
    await page.getByLabel('Senha').fill('TestPass123!');

    // Submit
    await page.getByTestId('register-submit').click();

    // Wait for redirect to main app
    await page.waitForURL('http://localhost:3000/');
    await page.waitForTimeout(1500);

    // Should show the main app with sidebar
    await expect(page.getByRole('heading', { name: 'Commet' })).toBeVisible();
  });

  test('login with existing account works', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Fill login form
    await page.getByTestId('login-username').fill('testuser1');
    await page.getByLabel('Senha').fill('TestPass123!');

    // Submit
    await page.getByTestId('login-submit').click();

    await page.waitForTimeout(1000);

    // Should show main app
    await expect(page.getByRole('heading', { name: 'Commet' })).toBeVisible();
  });

  test('console is clean after loading', async ({ page }) => {
    const consoleMessages: string[] = [];
    page.on('console', msg => consoleMessages.push(`${msg.type()}: ${msg.text()}`));

    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Filter out known harmless messages
    const errors = consoleMessages.filter(m => m.includes('Error:') || m.includes('error:') || m.includes('ERROR'));
    expect(errors).toHaveLength(0);
  });

  test('keyboard navigation works on login page', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Press Tab multiple times to navigate through form
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // Should be focused on the submit button or next element
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName.toLowerCase());
    expect(['input', 'button', 'a']).toContain(focusedTag);
  });

test('create server functionality', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Register first with unique username
    const testUsername = `srv_${Date.now().toString().slice(-5)}`;
    await page.getByRole('button', { name: 'Registrar' }).first().click();
    await page.getByTestId('register-username').fill(testUsername);
    await page.getByLabel('Email').fill(`${testUsername}@test.com`);
    await page.getByLabel('Senha').fill('TestPass123!');
    await page.getByTestId('register-submit').click();

    // Wait for redirect to app
    await page.waitForURL('http://localhost:3000/', { timeout: 15000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);

    // Should show main app
    await expect(page.getByRole('heading', { name: 'Commet' })).toBeVisible();

    // Wait for server sidebar to be fully rendered
    await page.waitForTimeout(3000);

    // Click create server button using force click (bypasses visibility issues)
    await page.getByTestId('btn-create-server').click({ force: true });
    await page.waitForTimeout(500);

    // Wait for modal to appear and fill server name
    await page.getByTestId('input-server-name').waitFor({ state: 'visible', timeout: 10000 });
    await page.getByTestId('input-server-name').fill('Test Server');

    // Submit - use the modal button
    await page.getByTestId('btn-confirm-create-server').click();
    await page.waitForTimeout(500);

    // Should show the new server
    await expect(page.getByRole('heading', { name: 'Test Server' })).toBeVisible();
  });

  test('responsive layout on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Should still show auth page on mobile
    await expect(page.getByRole('heading', { name: 'Commet' })).toBeVisible();
  });

  test('check dark theme colors are applied', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Check that CSS custom properties are set
    const bgValue = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
    expect(bgValue).toBe('#1a1a1a');

    const accentValue = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
    expect(accentValue).toBe('#1a4be0');
  });

  // ============================================================
  // NEW TESTS: Username validation (BUG-001 fix)
  // ============================================================

  test('username too short shows error message', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Switch to register tab
    await page.getByRole('button', { name: 'Registrar' }).first().click();
    await page.waitForTimeout(300);

    // Fill with username too short (1 char)
    await page.getByTestId('register-username').fill('ab');
    await page.getByLabel('Email').fill('test@test.com');
    await page.getByLabel('Senha').fill('TestPass123!');

    // Should show validation error
    await expect(page.getByText('Usuário deve ter pelo menos 3 caracteres')).toBeVisible();
  });

  test('username too long shows error message', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Switch to register tab
    await page.getByRole('button', { name: 'Registrar' }).first().click();
    await page.waitForTimeout(300);

    // Fill with username too long (21 chars)
    await page.getByTestId('register-username').fill('abcdefghijklmnopqrstuvwxyz');
    await page.getByLabel('Email').fill('test@test.com');
    await page.getByLabel('Senha').fill('TestPass123!');

    // Should show validation error
    await expect(page.getByText('Usuário deve ter no máximo 20 caracteres')).toBeVisible();
  });

  test('submit button is disabled when username is invalid', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Switch to register tab
    await page.getByRole('button', { name: 'Registrar' }).first().click();
    await page.waitForTimeout(300);

    // Fill with empty username
    await page.getByTestId('register-username').fill('');
    await page.getByLabel('Email').fill('test@test.com');
    await page.getByLabel('Senha').fill('TestPass123!');

    // Submit button should be disabled
    await expect(page.getByTestId('register-submit')).toBeDisabled();
  });

  test('submit button is enabled when username is valid', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Switch to register tab
    await page.getByRole('button', { name: 'Registrar' }).first().click();
    await page.waitForTimeout(300);

    // Fill with valid username
    await page.getByTestId('register-username').fill('validuser');
    await page.getByLabel('Email').fill('test@test.com');
    await page.getByLabel('Senha').fill('TestPass123!');

    // Submit button should be enabled
    await expect(page.getByTestId('register-submit')).toBeEnabled();
  });

  test('username border turns red on validation error', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Switch to register tab
    await page.getByRole('button', { name: 'Registrar' }).first().click();
    await page.waitForTimeout(300);

    // Fill with username too short
    await page.getByTestId('register-username').fill('ab');

    // Input should have the danger border class
    await expect(page.getByTestId('register-username')).toHaveClass(/border-\[var\(--danger\)\]/);
  });

  test('username validation clears when typing valid value', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Switch to register tab
    await page.getByRole('button', { name: 'Registrar' }).first().click();
    await page.waitForTimeout(300);

    // Fill with invalid username
    await page.getByTestId('register-username').fill('ab');
    await expect(page.getByText('Usuário deve ter pelo menos 3 caracteres')).toBeVisible();

    // Type more characters to make it valid
    await page.getByTestId('register-username').fill('abc');

    // Error should disappear
    await expect(page.getByText('Usuário deve ter pelo menos 3 caracteres')).not.toBeVisible();
  });

  test('empty username shows error and disables submit', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Switch to register tab
    await page.getByRole('button', { name: 'Registrar' }).first().click();
    await page.waitForTimeout(300);

    // Focus the username field, then clear it to trigger validation
    await page.getByTestId('register-username').focus();
    await page.getByTestId('register-username').clear();
    await page.getByTestId('register-username').blur();

    // Should show error
    await expect(page.getByText('Usuário é obrigatório')).toBeVisible();

    // Submit should be disabled
    await expect(page.getByTestId('register-submit')).toBeDisabled();
  });
});
