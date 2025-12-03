import { test, expect, Page } from '@playwright/test'

const testPassword = 'TestPassword123!'

// Helper function to register a new user and return the username
async function registerUser(page: Page): Promise<string> {
  const username = `testuser${Date.now()}`
  await page.goto('/register')
  await page.getByLabel('Profile Name').fill(username)
  await page.getByLabel('Password', { exact: true }).fill(testPassword)
  await page.getByLabel('Confirm Password').fill(testPassword)
  await page.getByRole('button', { name: 'Register' }).click()
  await expect(page.locator('.v-alert')).toContainText('Registration successful', { timeout: 1000 })
  await expect(page).toHaveURL('/login', { timeout: 3000 })
  return username
}

// Helper function to login with given credentials
async function login(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Profile Name').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page).toHaveURL('/market')
}

test.describe('User Management Flow', () => {
  test('should register a new user account', async ({ page }) => {
    const username = `testuser${Date.now()}`
    await page.goto('/register')

    // Fill registration form
    await page.getByLabel('Profile Name').fill(username)
    await page.getByLabel('Password', { exact: true }).fill(testPassword)
    await page.getByLabel('Confirm Password').fill(testPassword)

    // Submit registration
    await page.getByRole('button', { name: 'Register' }).click()

    // Should show success message (wait for it with longer timeout since it redirects after 2s)
    await expect(page.locator('.v-alert')).toContainText('Registration successful', {
      timeout: 1000,
    })

    // Should redirect to login page after successful registration
    await expect(page).toHaveURL('/login', { timeout: 3000 })
  })

  test('should login with registered credentials', async ({ page }) => {
    const username = await registerUser(page)

    await page.goto('/login')

    // Fill login form
    await page.getByLabel('Profile Name').fill(username)
    await page.getByLabel('Password').fill(testPassword)

    // Submit login
    await page.getByRole('button', { name: 'Login' }).click()

    // Should redirect to market page after successful login
    await expect(page).toHaveURL('/market')

    // Navbar should be visible with Account link
    await expect(page.getByRole('link', { name: 'Account' })).toBeVisible()
  })

  test('should view user profile', async ({ page }) => {
    const username = await registerUser(page)
    await login(page, username, testPassword)

    // Navigate to account page
    await page.getByRole('link', { name: 'Account' }).click()
    await expect(page).toHaveURL('/account')

    // Verify profile information is loaded
    await expect(page.getByLabel('Profile Name')).toHaveValue(username)
    await expect(page.getByLabel('Display Name')).toHaveValue(username)

    // Verify roles are displayed (should be "Applicant" for new user)
    const rolesField = page.getByLabel('Roles')
    await expect(rolesField).toBeVisible()
  })

  test('should update profile settings', async ({ page }) => {
    const username = await registerUser(page)
    await login(page, username, testPassword)

    // Navigate to account page
    await page.goto('/account')

    // Wait for profile to load
    await expect(page.getByLabel('Profile Name')).toBeVisible()

    // Update display name
    const newDisplayName = `${username} Updated`
    await page.getByLabel('Display Name').fill(newDisplayName)

    // Update FIO username
    await page.getByLabel('FIO Username').fill('fio_testuser')

    // Update preferred currency
    // Click the v-select field (not the label, which is blocked by v-field__input)
    await page.locator('.v-select:has-text("Preferred Currency")').click()
    await page.locator('.v-list-item').filter({ hasText: 'ICA' }).click()

    // Save changes
    await page.getByRole('button', { name: 'Save Changes' }).click()

    // Should show success message
    await expect(page.locator('.v-snackbar')).toContainText('Profile updated successfully')

    // Reload page and verify changes persisted
    await page.reload()
    await expect(page.getByLabel('Display Name')).toHaveValue(newDisplayName)
    await expect(page.getByLabel('FIO Username')).toHaveValue('fio_testuser')
  })

  test('should change password successfully', async ({ page }) => {
    const username = await registerUser(page)
    await login(page, username, testPassword)

    // Navigate to account page
    await page.goto('/account')

    const newPassword = 'NewTestPassword456!'

    // Fill password change form
    await page.getByLabel('Current Password').fill(testPassword)
    await page.getByLabel('New Password', { exact: true }).fill(newPassword)
    await page.getByLabel('Confirm New Password').fill(newPassword)

    // Submit password change
    await page.getByRole('button', { name: 'Update Password' }).click()

    // Should show success message
    await expect(page.locator('.v-snackbar')).toContainText('Password updated successfully')

    // Password fields should be cleared
    await expect(page.getByLabel('Current Password')).toHaveValue('')
    await expect(page.getByLabel('New Password', { exact: true })).toHaveValue('')
    await expect(page.getByLabel('Confirm New Password')).toHaveValue('')

    // Logout
    await page.getByRole('button', { name: 'Logout' }).click()
    await expect(page).toHaveURL('/login')

    // Login with new password
    await page.getByLabel('Profile Name').fill(username)
    await page.getByLabel('Password').fill(newPassword)
    await page.getByRole('button', { name: 'Login' }).click()

    // Should successfully login
    await expect(page).toHaveURL('/market')
  })

  test('should show error for wrong current password', async ({ page }) => {
    const username = await registerUser(page)
    const newPassword = 'NewTestPassword456!'

    // Login and change password first
    await login(page, username, testPassword)
    await page.goto('/account')
    await page.getByLabel('Current Password').fill(testPassword)
    await page.getByLabel('New Password', { exact: true }).fill(newPassword)
    await page.getByLabel('Confirm New Password').fill(newPassword)
    await page.getByRole('button', { name: 'Update Password' }).click()
    await expect(page.locator('.v-snackbar')).toContainText('Password updated successfully')

    // Now try to change password with wrong current password
    await page.getByLabel('Current Password').fill('WrongPassword123!')
    await page.getByLabel('New Password', { exact: true }).fill('AnotherPassword789!')
    await page.getByLabel('Confirm New Password').fill('AnotherPassword789!')
    await page.getByRole('button', { name: 'Update Password' }).click()

    // Should show error message
    await expect(page.locator('.v-snackbar')).toContainText('Current password is incorrect')
  })

  test('should show error for mismatched passwords', async ({ page }) => {
    const username = await registerUser(page)
    await login(page, username, testPassword)

    // Navigate to account page
    await page.goto('/account')

    // Try to change password with mismatched new passwords
    await page.getByLabel('Current Password').fill(testPassword)
    await page.getByLabel('New Password', { exact: true }).fill('AnotherPassword789!')
    await page.getByLabel('Confirm New Password').fill('DifferentPassword789!')

    await page.getByRole('button', { name: 'Update Password' }).click()

    // Should show error message
    await expect(page.locator('.v-snackbar')).toContainText('New passwords do not match')
  })

  test('should show error for short password', async ({ page }) => {
    const username = await registerUser(page)
    await login(page, username, testPassword)

    // Navigate to account page
    await page.goto('/account')

    // Try to change password to a short password
    await page.getByLabel('Current Password').fill(testPassword)
    await page.getByLabel('New Password', { exact: true }).fill('short')
    await page.getByLabel('Confirm New Password').fill('short')

    await page.getByRole('button', { name: 'Update Password' }).click()

    // Should show error message
    await expect(page.locator('.v-snackbar')).toContainText(
      'Password must be at least 8 characters'
    )
  })
})

test.describe('Authentication Error Cases', () => {
  test('should show error for invalid login credentials', async ({ page }) => {
    await page.goto('/login')

    // Try to login with invalid credentials
    await page.getByLabel('Profile Name').fill('nonexistentuser')
    await page.getByLabel('Password').fill('wrongpassword')

    await page.getByRole('button', { name: 'Login' }).click()

    // Should show error message in v-alert (could be "Account not found" or "Invalid credentials")
    const alert = page.locator('.v-alert')
    await expect(alert).toBeVisible()
    await expect(alert.locator('text=/Account not found|Invalid credentials/')).toBeVisible()
  })

  test('should show error for duplicate username registration', async ({ page }) => {
    // First, register a new user
    const duplicateTestUsername = `duplicate${Date.now()}`
    await page.goto('/register')
    await page.getByLabel('Profile Name').fill(duplicateTestUsername)
    await page.getByLabel('Password', { exact: true }).fill('TestPassword123!')
    await page.getByLabel('Confirm Password').fill('TestPassword123!')
    await page.getByRole('button', { name: 'Register' }).click()

    // Wait for success and redirect
    await expect(page.locator('.v-alert')).toContainText('Registration successful', {
      timeout: 1000,
    })
    await expect(page).toHaveURL('/login', { timeout: 3000 })

    // Now try to register again with the same username
    await page.goto('/register')
    await page.getByLabel('Profile Name').fill(duplicateTestUsername)
    await page.getByLabel('Password', { exact: true }).fill('AnotherPassword123!')
    await page.getByLabel('Confirm Password').fill('AnotherPassword123!')
    await page.getByRole('button', { name: 'Register' }).click()

    // Should show error message about duplicate username in v-alert
    await expect(page.locator('.v-alert')).toContainText('already taken')
  })

  test('should redirect to login when accessing protected route without auth', async ({ page }) => {
    // Clear any existing auth
    await page.context().clearCookies()
    await page.goto('/account')

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/)
  })
})
