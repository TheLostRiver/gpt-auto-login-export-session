const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

require('../data/names.js');
require('../background/steps/fill-profile.js');
require('../background/steps/fetch-login-code.js');

test('random profile age is generated from 18 to 60 inclusive', () => {
  assert.equal(typeof globalThis.generateRandomAge, 'function');

  const originalRandom = Math.random;
  try {
    Math.random = () => 0;
    assert.equal(globalThis.generateRandomAge(), 18);

    Math.random = () => 0.999999;
    assert.equal(globalThis.generateRandomAge(), 60);

    for (const randomValue of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      Math.random = () => randomValue;
      const age = globalThis.generateRandomAge();
      assert.equal(Number.isInteger(age), true);
      assert.equal(age >= 18, true);
      assert.equal(age <= 60, true);
    }
  } finally {
    Math.random = originalRandom;
  }
});

test('step 5 profile fill payload includes generated age', async () => {
  let sentMessage = null;
  const executor = globalThis.MultiPageBackgroundStep5.createStep5Executor({
    addLog: async () => {},
    generateRandomAge: () => 37,
    generateRandomBirthday: () => ({ year: 1989, month: 7, day: 14 }),
    generateRandomName: () => ({ firstName: 'Ada', lastName: 'Lovelace' }),
    sendToContentScript: async (_source, message) => {
      sentMessage = message;
    },
  });

  await executor.executeStep5();

  assert.deepEqual(sentMessage.payload, {
    firstName: 'Ada',
    lastName: 'Lovelace',
    age: 37,
    year: 1989,
    month: 7,
    day: 14,
  });
});

test('step 8 login verification passes signup profile with generated age', async () => {
  let resolvedOptions = null;
  const executor = globalThis.MultiPageBackgroundStep8.createStep8Executor({
    addLog: async () => {},
    chrome: { tabs: { update: async () => {} } },
    completeNodeFromBackground: async () => {},
    ensureStep8VerificationPageReady: async () => ({
      state: 'verification_page',
      displayedEmail: 'one@example.com',
    }),
    generateRandomAge: () => 42,
    generateRandomBirthday: () => ({ year: 1984, month: 2, day: 29 }),
    generateRandomName: () => ({ firstName: 'Grace', lastName: 'Hopper' }),
    getMailConfig: () => ({ provider: 'hotmail-api', source: 'hotmail-api', label: 'Outlook' }),
    getState: async () => ({}),
    getTabId: async () => 123,
    isTabAlive: async () => true,
    isVerificationMailPollingError: () => false,
    resolveSignupEmailForFlow: async () => 'one@example.com',
    resolveVerificationStep: async (_step, _state, _mail, options) => {
      resolvedOptions = options;
    },
    reuseOrCreateTab: async () => 123,
    sendToContentScriptResilient: async () => ({}),
    setState: async () => {},
    shouldUseCustomRegistrationEmail: () => false,
    sleepWithStop: async () => {},
    STANDARD_MAIL_VERIFICATION_RESEND_INTERVAL_MS: 0,
    STEP7_MAIL_POLLING_RECOVERY_MAX_ATTEMPTS: 1,
    throwIfStopped: () => {},
  });

  await executor.executeStep8({
    email: 'one@example.com',
    oauthUrl: 'https://auth.openai.com/log-in',
  });

  assert.deepEqual(resolvedOptions.signupProfile, {
    firstName: 'Grace',
    lastName: 'Hopper',
    age: 42,
    year: 1984,
    month: 2,
    day: 29,
  });
});

test('verification submit and profile page detection support step 8 profile completion', () => {
  const verificationFlowSource = fs.readFileSync(path.join(__dirname, '..', 'background', 'verification-flow.js'), 'utf8');
  assert.match(
    verificationFlowSource,
    /\.\.\.\(\(step === 4 \|\| step === 8\) && options\.signupProfile \? \{ signupProfile: options\.signupProfile \} : \{\}\)/
  );
  assert.match(verificationFlowSource, /isSignupProfilePageUrl\(currentUrl\)/);
  assert.match(verificationFlowSource, /reason:\s*'signup_profile'/);

  const signupPageSource = fs.readFileSync(path.join(__dirname, '..', 'content', 'signup-page.js'), 'utf8');
  assert.match(signupPageSource, /state:\s*'signup_profile'/);
  assert.match(signupPageSource, /completeSignupProfileAfterVerification\(step, options\?\.signupProfile \|\| \{\}/);
  assert.match(signupPageSource, /input\[aria-label\*="年龄"\]/);
  assert.match(signupPageSource, /input\[placeholder\*="Full name" i\]/);
});
