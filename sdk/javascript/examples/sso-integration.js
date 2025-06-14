const { TekParolaClient } = require('tekparola-sdk');

// Initialize client with OAuth credentials
const client = new TekParolaClient({
  baseUrl: 'http://localhost:3000',
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
  debug: true
});

// Example for a web application
async function webAppSSOFlow(req, res) {
  try {
    // Step 1: Initialize SSO and redirect user
    if (!req.query.code) {
      console.log('Initializing SSO flow...');
      
      const { authorizationUrl, state } = await client.auth.initSSO({
        applicationId: 'your-app-id',
        redirectUri: 'http://localhost:8080/callback',
        scope: 'openid profile email',
        state: generateRandomState(),
        prompt: 'login' // Force login screen
      });

      // Store state in session for verification
      req.session.oauthState = state;

      // Redirect user to authorization URL
      res.redirect(authorizationUrl);
      return;
    }

    // Step 2: Handle callback with authorization code
    const { code, state } = req.query;

    // Verify state to prevent CSRF
    if (state !== req.session.oauthState) {
      throw new Error('Invalid state parameter');
    }

    console.log('Exchanging authorization code for tokens...');
    
    const tokens = await client.auth.exchangeCodeForTokens({
      code,
      state
    });

    console.log('Tokens received:', tokens);

    // Step 3: Get user information
    const userInfo = await client.auth.getUserInfo();
    console.log('User info:', userInfo);

    // Store tokens in session or database
    req.session.accessToken = tokens.accessToken;
    req.session.refreshToken = tokens.refreshToken;
    req.session.user = userInfo;

    // Redirect to application
    res.redirect('/dashboard');

  } catch (error) {
    console.error('SSO Error:', error);
    res.redirect('/login?error=' + encodeURIComponent(error.message));
  }
}

// Example for a single-page application (SPA)
async function spaSSOFlow() {
  try {
    // Step 1: Initialize SSO
    const { authorizationUrl, state } = await client.auth.initSSO({
      applicationId: 'your-app-id',
      redirectUri: window.location.origin + '/callback',
      scope: 'openid profile email',
      state: generateRandomState()
    });

    // Store state in localStorage
    localStorage.setItem('oauth_state', state);

    // Redirect to authorization URL
    window.location.href = authorizationUrl;

  } catch (error) {
    console.error('SSO initialization error:', error);
  }
}

// Handle callback in SPA
async function handleSPACallback() {
  try {
    // Parse URL parameters
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');

    if (!code) {
      throw new Error('No authorization code received');
    }

    // Verify state
    const savedState = localStorage.getItem('oauth_state');
    if (state !== savedState) {
      throw new Error('Invalid state parameter');
    }

    // Exchange code for tokens
    const tokens = await client.auth.exchangeCodeForTokens({
      code,
      state
    });

    // Store tokens
    localStorage.setItem('access_token', tokens.accessToken);
    if (tokens.refreshToken) {
      localStorage.setItem('refresh_token', tokens.refreshToken);
    }

    // Get user info
    const userInfo = await client.auth.getUserInfo();
    console.log('Logged in as:', userInfo.email);

    // Redirect to app
    window.location.href = '/dashboard';

  } catch (error) {
    console.error('Callback error:', error);
    window.location.href = '/login?error=' + encodeURIComponent(error.message);
  }
}

// Silent token refresh for SPA
async function silentTokenRefresh() {
  try {
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const tokens = await client.auth.refreshToken(refreshToken);
    
    // Update stored tokens
    localStorage.setItem('access_token', tokens.accessToken);
    if (tokens.refreshToken) {
      localStorage.setItem('refresh_token', tokens.refreshToken);
    }

    console.log('Token refreshed successfully');
    return tokens;

  } catch (error) {
    console.error('Token refresh failed:', error);
    // Redirect to login
    window.location.href = '/login';
  }
}

// Utility function to generate random state
function generateRandomState() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Example: Check if user is authenticated
async function checkAuthentication() {
  try {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      return false;
    }

    // Set the access token
    client.setAccessToken(accessToken);

    // Verify token is still valid
    const profile = await client.user.getProfile();
    return !!profile;

  } catch (error) {
    if (error.statusCode === 401) {
      // Try to refresh token
      await silentTokenRefresh();
      return true;
    }
    return false;
  }
}

// Example: Logout
async function logout() {
  try {
    await client.auth.logout();
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    // Clear local storage
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('oauth_state');
    
    // Redirect to login
    window.location.href = '/login';
  }
}

module.exports = {
  webAppSSOFlow,
  spaSSOFlow,
  handleSPACallback,
  silentTokenRefresh,
  checkAuthentication,
  logout
};