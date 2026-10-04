'use strict';
/**
 * Resets the password of an administrator account.
 *
 * Passwords are stored as salted scrypt hashes, so a forgotten one cannot be recovered - only
 * replaced. This writes a new hash straight into the database (file or Postgres, whichever the
 * environment selects) without touching centres, sessions, uploads or any other account.
 *
 *   npm run set-admin-password                  prompts, and targets the default admin
 *   npm run set-admin-password -- you@org.org   prompts, and targets that account
 *
 * The new password is typed at a hidden prompt so it never reaches the shell history. For
 * automation, set CTP_NEW_ADMIN_PASSWORD instead and the prompt is skipped.
 */
const readline = require('readline');
const config = require('./config');
const store = require('./store');
const database = require('./db');
const { hashPassword } = require('./seed');

const MIN_LENGTH = 10;

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // Echo nothing at all; a length-revealing run of asterisks is not worth printing.
      rl._writeToOutput = (chunk) => {
        if (chunk.includes(question)) rl.output.write(question);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

async function main() {
  await store.init();

  const requested = (process.argv[2] || process.env.CTP_ADMIN_EMAIL || config.DEFAULT_ADMIN.email)
    .trim().toLowerCase();
  const data = store.db();
  const admins = data.users.filter((u) => u.role === 'admin');
  const user = data.users.find((u) => String(u.email).trim().toLowerCase() === requested);

  if (!user) {
    console.error(`No account found for "${requested}".`);
    console.error(admins.length
      ? `Administrator accounts present: ${admins.map((a) => a.email).join(', ')}`
      : 'There are no administrator accounts in this database.');
    process.exitCode = 1;
    return;
  }

  console.log(`Storage : ${store.describe()}`);
  console.log(`Account : ${user.email}  (role: ${user.role})`);

  let password = process.env.CTP_NEW_ADMIN_PASSWORD || '';
  if (password) {
    console.log('Using the password supplied in CTP_NEW_ADMIN_PASSWORD.');
  } else {
    password = await ask('New password (nothing is echoed): ', { hidden: true });
    const again = await ask('Confirm it: ', { hidden: true });
    if (password !== again) {
      console.error('The two entries do not match. Nothing was changed.');
      process.exitCode = 1;
      return;
    }
  }

  if (password.length < MIN_LENGTH) {
    console.error(`Too short - use at least ${MIN_LENGTH} characters. Nothing was changed.`);
    process.exitCode = 1;
    return;
  }

  const where = await store.backup('before-password-reset');
  const { salt, hash } = hashPassword(password);
  user.passwordSalt = salt;
  user.passwordHash = hash;
  // The operator chose this value themselves, so there is nothing left to prompt them about.
  user.mustChangePassword = false;
  store.logActivity(user.email, 'admin.password-reset', 'Password reset from the command line.');
  await store.save();

  console.log(`Snapshot taken: ${where}`);
  console.log(`Password updated for ${user.email}. Sign in with it now.`);
}

main()
  .catch((err) => {
    console.error('Password reset failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => database.close());
