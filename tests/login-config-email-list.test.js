const assert = require('node:assert/strict');
const test = require('node:test');

require('../background/login-config-email-list.js');

const helpers = globalThis.MultiPageLoginConfigEmailList;

test('login config email list keeps example.edu entries in file order', () => {
  const emails = helpers.parseLoginConfigEmailList(`
    # comment
    FIRST@example.edu
    other@example.com
    second@example.edu # inline comment
    first@example.edu
    broken
  `, { allowedDomain: 'example.edu' });

  assert.deepEqual(emails, [
    'first@example.edu',
    'second@example.edu',
  ]);
});

test('login config email reader loads extension config and returns nth run email', async () => {
  const reader = helpers.createLoginConfigEmailListReader({
    chrome: {
      runtime: {
        getURL(path) {
          return `chrome-extension://test/${path}`;
        },
      },
    },
    fetch: async (url) => ({
      ok: true,
      text: async () => {
        assert.equal(url, 'chrome-extension://test/data/kimi-cpa-relogin-emails.txt');
        return 'one@example.edu\ntwo@example.edu\n';
      },
    }),
    allowedDomain: 'example.edu',
    configPath: 'data/kimi-cpa-relogin-emails.txt',
  });

  assert.equal(await reader.getEmailForRun(2), 'two@example.edu');
});

test('login config email queue locks pending entries and keeps running email for retry', () => {
  const queue = helpers.buildLoginConfigEmailQueue([
    'one@example.edu',
    'two@example.edu',
  ]);

  const firstLock = helpers.lockLoginConfigEmailQueueEntry(queue, {
    run: 1,
    attempt: 1,
    now: 100,
  });
  assert.equal(firstLock.email, 'one@example.edu');
  assert.equal(firstLock.queue[0].status, 'running');
  assert.equal(firstLock.queue[0].attempts, 1);

  const retryLock = helpers.lockLoginConfigEmailQueueEntry(firstLock.queue, {
    run: 1,
    attempt: 2,
    now: 200,
  });
  assert.equal(retryLock.email, 'one@example.edu');
  assert.equal(retryLock.queue[0].attempts, 2);

  const finishedQueue = helpers.markLoginConfigEmailQueueEntry(retryLock.queue, {
    email: 'one@example.edu',
    status: 'failed',
    reason: '401',
    now: 300,
  });
  assert.equal(finishedQueue[0].status, 'failed');
  assert.equal(finishedQueue[0].reason, '401');

  const secondLock = helpers.lockLoginConfigEmailQueueEntry(finishedQueue, {
    run: 2,
    attempt: 1,
    now: 400,
  });
  assert.equal(secondLock.email, 'two@example.edu');
});
