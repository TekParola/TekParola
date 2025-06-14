const { TekParolaClient } = require('tekparola-sdk');

// Initialize client
const client = new TekParolaClient({
  baseUrl: 'http://localhost:3000',
  debug: true // Enable debug logging
});

async function basicAuthExample() {
  try {
    // 1. Register a new user
    console.log('1. Registering new user...');
    const { user, requiresEmailVerification } = await client.auth.register({
      email: 'test@example.com',
      password: 'SecurePassword123!',
      firstName: 'Test',
      lastName: 'User',
      phoneNumber: '+1234567890'
    });
    console.log('User registered:', user.email);
    console.log('Email verification required:', requiresEmailVerification);

    // 2. Login with email/password
    console.log('\n2. Logging in...');
    const loginResult = await client.auth.login({
      email: 'test@example.com',
      password: 'SecurePassword123!',
      rememberMe: true
    });

    if (loginResult.requiresTwoFactor) {
      console.log('Two-factor authentication required');
      // Handle 2FA flow
      const code = prompt('Enter 2FA code: ');
      const { tokens, user } = await client.auth.verifyTwoFactor({
        tempToken: loginResult.tempToken,
        code
      });
      console.log('Login successful with 2FA');
    } else {
      console.log('Login successful');
      console.log('Access token:', loginResult.tokens.accessToken);
      console.log('User:', loginResult.user);
    }

    // 3. Get user profile
    console.log('\n3. Getting user profile...');
    const profile = await client.user.getProfile();
    console.log('Profile:', profile);

    // 4. Update profile
    console.log('\n4. Updating profile...');
    const updatedProfile = await client.user.updateProfile({
      firstName: 'Updated',
      lastName: 'Name',
      timezone: 'America/New_York'
    });
    console.log('Profile updated:', updatedProfile);

    // 5. Change password
    console.log('\n5. Changing password...');
    await client.user.changePassword('SecurePassword123!', 'NewSecurePassword456!');
    console.log('Password changed successfully');

    // 6. Get sessions
    console.log('\n6. Getting active sessions...');
    const sessions = await client.user.getSessions();
    console.log(`Found ${sessions.length} active sessions`);
    sessions.forEach(session => {
      console.log(`- ${session.device} (${session.ipAddress})`);
    });

    // 7. Refresh token
    console.log('\n7. Refreshing access token...');
    const newTokens = await client.auth.refreshToken(loginResult.tokens.refreshToken);
    console.log('New access token obtained');

    // 8. Logout
    console.log('\n8. Logging out...');
    await client.auth.logout();
    console.log('Logged out successfully');

  } catch (error) {
    console.error('Error:', error.message);
    if (error.details) {
      console.error('Details:', error.details);
    }
  }
}

// Run the example
basicAuthExample();