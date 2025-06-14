#!/usr/bin/env ts-node

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * Generate a cryptographically secure random secret
 */
function generateSecret(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Check if .env file exists
 */
function checkEnvFile(): boolean {
  const envPath = path.join(process.cwd(), '.env');
  return fs.existsSync(envPath);
}

/**
 * Generate secure secrets for the application
 */
function generateSecrets(): void {
  console.log('🔐 TekParola SSO - Secure Secret Generator\n');
  
  if (checkEnvFile()) {
    console.log('⚠️  WARNING: .env file already exists!');
    console.log('   This script will display new secrets but will NOT modify your .env file.');
    console.log('   Please update your .env file manually with these secrets.\n');
  } else {
    console.log('ℹ️  No .env file found. Copy .env.example to .env and update with these secrets.\n');
  }
  
  console.log('Generated Secure Secrets:');
  console.log('========================\n');
  
  // Generate JWT secrets
  const jwtSecret = generateSecret(32);
  const jwtRefreshSecret = generateSecret(32);
  const sessionSecret = generateSecret(32);
  
  console.log('JWT_SECRET=' + jwtSecret);
  console.log('JWT_REFRESH_SECRET=' + jwtRefreshSecret);
  console.log('SESSION_SECRET=' + sessionSecret);
  
  console.log('\n📋 Instructions:');
  console.log('================');
  console.log('1. Copy the secrets above');
  console.log('2. Update your .env file with these values');
  console.log('3. NEVER commit these secrets to version control');
  console.log('4. Use different secrets for each environment (dev, staging, production)');
  console.log('5. Rotate secrets periodically for security\n');
  
  // Additional security recommendations
  console.log('🛡️  Security Best Practices:');
  console.log('==========================');
  console.log('- Store production secrets in a secure vault (e.g., AWS Secrets Manager, HashiCorp Vault)');
  console.log('- Use environment-specific secrets');
  console.log('- Enable secret rotation policies');
  console.log('- Monitor for exposed secrets in your codebase');
  console.log('- Use strong passwords for database and Redis connections\n');
}

// Run the script
if (require.main === module) {
  generateSecrets();
}