#!/usr/bin/env node
/**
 * setup-admin.js
 * One-time setup script to create the first admin account.
 * Usage: npm run setup:admin
 */

import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import readline from 'readline';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('ERROR: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set.');
  console.error('Copy .env.example to .env and fill in your Supabase values.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

async function main() {
  console.log('=== MNX Shop Admin Account Setup ===');
  console.log('This script creates the first admin account.');
  console.log('No default or hardcoded credentials are used.\n');

  const email = await question('Admin email address: ').then((a) => a.trim().toLowerCase());
  if (!email) {
    console.error('ERROR: Email is required.');
    process.exit(1);
  }

  const password = await question('Admin password (min 12 characters): ');
  if (password.length < 12) {
    console.error('ERROR: Password must be at least 12 characters long.');
    process.exit(1);
  }

  const confirm = await question('Confirm password: ');
  if (password !== confirm) {
    console.error('ERROR: Passwords do not match.');
    process.exit(1);
  }

  rl.close();

  const { data: existing } = await supabase
    .from('admin_users')
    .select('id, email')
    .eq('email', email)
    .single();

  if (existing) {
    console.error('ERROR: Admin account with email ' + email + ' already exists.');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const { data, error } = await supabase
    .from('admin_users')
    .insert({
      email,
      password_hash: passwordHash,
      totp_enabled: false,
      failed_login_attempts: 0,
    })
    .select('id, email, created_at')
    .single();

  if (error) {
    console.error('ERROR: Failed to create admin account: ' + error.message);
    process.exit(1);
  }

  console.log('\nAdmin account created successfully!');
  console.log('  ID:     ' + data.id);
  console.log('  Email:  ' + data.email);
  console.log('  Created: ' + data.created_at);
  console.log('\nNext steps:');
  console.log('  1. Log in at https://mnx-shop.vercel.app/admin');
  console.log('  2. Set up TOTP 2FA (mandatory) - scan QR code with authenticator app');
  console.log('  3. Save your 8 recovery codes in a secure location');
  console.log('\nSecurity reminders:');
  console.log('  - Change your password after first login');
  console.log('  - Store recovery codes offline - they are your only 2FA fallback');
  console.log('  - Never commit this script or its output to version control');
}

main().catch((err) => {
  console.error('FATAL: ' + err.message);
  process.exit(1);
});