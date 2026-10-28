'use strict';

/**
 * Assigns a role to an existing user from the command line (server-side only).
 * This is the secure way to promote someone to admin: it needs database access,
 * which API clients never have.
 *
 *   npm run set-role -- someone@company.com admin
 *   npm run set-role -- someone@company.com user
 */
const config = require('../src/config/env');
const { connectDatabase, disconnectDatabase } = require('../src/config/database');
const User = require('../src/models/User');

async function main() {
  const [emailArg, roleArg] = process.argv.slice(2);
  const email = String(emailArg || '').trim().toLowerCase();
  const role = String(roleArg || '').trim().toLowerCase();

  if (!email || !Object.values(User.ROLES).includes(role)) {
    console.error('Usage: npm run set-role -- <email> <admin|user>');
    process.exit(1);
  }

  await connectDatabase(config.mongoUri, { retries: 1 });
  const user = await User.findOneAndUpdate({ email }, { $set: { role } }, { returnDocument: 'after' });
  if (!user) {
    console.error(`No user found with email ${email}. They must sign up first.`);
    await disconnectDatabase();
    process.exit(1);
  }
  console.info(`Role for ${user.email} is now "${user.role}". New tokens will carry this role (log in again).`);
  await disconnectDatabase();
}

main().catch(async (err) => {
  console.error(err.message);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
