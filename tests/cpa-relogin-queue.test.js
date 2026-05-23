const assert = require('node:assert/strict');
const test = require('node:test');

require('../background/cpa-relogin-queue.js');

const helpers = globalThis.MultiPageCpaReloginQueue;

test('CPA relogin queue keeps token-invalid accounts and excludes banned mail from runnable set', () => {
  const queue = helpers.buildCpaReloginQueue([
    { name: 'ok@example.edu.json', status: 'error', status_message: '401 unauthorized' },
    { name: 'ban@example.edu.json', status: 'error', status_message: '401 unauthorized' },
    { name: 'active@example.edu.json', status: 'active' },
    { name: 'skip@example.com.json', status: 'error', status_message: '401 unauthorized' },
  ], {
    allowedDomain: 'example.edu',
    mailStatuses: {
      'ban@example.edu': { status: 'banned', reason: 'access deactivated mail found' },
    },
    now: 100,
  });

  assert.deepEqual(queue.map((entry) => [entry.email, entry.status, entry.reason]), [
    ['ok@example.edu', 'pending', ''],
    ['ban@example.edu', 'banned', 'access deactivated mail found'],
  ]);
  assert.deepEqual(helpers.getRunnableCpaReloginEmails(queue), ['ok@example.edu']);
});

test('CPA probe 401 marks unknown auth file as token invalid', () => {
  const status = helpers.classifyCpaAuthFile({
    name: 'ok@example.edu.json',
    probe: { ok: false, error: 'HTTP 401: unauthorized' },
  });

  assert.equal(status, 'token_invalid');
});

test('CPA disabled auth file is treated as relogin candidate, not banned', () => {
  const queue = helpers.buildCpaReloginQueue([
    { name: 'disabled@example.edu.json', status: 'disabled', disabled: true },
  ], {
    allowedDomain: 'example.edu',
    now: 100,
  });

  assert.deepEqual(queue.map((entry) => [entry.email, entry.status]), [
    ['disabled@example.edu', 'pending'],
  ]);
});

test('CPA deactivated probe text still needs mail evidence before banning', () => {
  const queue = helpers.buildCpaReloginQueue([
    {
      name: 'probe-ban-text@example.edu.json',
      status: 'disabled',
      disabled: true,
      probe: { error: 'account deactivated by upstream' },
    },
  ], {
    allowedDomain: 'example.edu',
    now: 100,
  });

  assert.deepEqual(queue.map((entry) => [entry.email, entry.status, entry.reason]), [
    ['probe-ban-text@example.edu', 'pending', ''],
  ]);
});

test('CPA queue locks one pending account and keeps it for retry', () => {
  const queue = helpers.buildCpaReloginQueue([
    { name: 'one@example.edu.json', status: 'error', status_message: '401 unauthorized' },
    { name: 'two@example.edu.json', status: 'error', status_message: '401 unauthorized' },
  ], { allowedDomain: 'example.edu', now: 100 });

  const firstLock = helpers.lockCpaReloginQueueEntry(queue, {
    run: 1,
    attempt: 1,
    now: 200,
  });
  assert.equal(firstLock.email, 'one@example.edu');
  assert.equal(firstLock.queue[0].status, 'running');

  const retryLock = helpers.lockCpaReloginQueueEntry(firstLock.queue, {
    run: 1,
    attempt: 2,
    now: 300,
  });
  assert.equal(retryLock.email, 'one@example.edu');
  assert.equal(retryLock.queue[0].attempts, 2);

  const successQueue = helpers.markCpaReloginQueueEntry(retryLock.queue, {
    email: 'one@example.edu',
    status: 'success',
    reason: 'imported',
    now: 400,
  });
  const secondLock = helpers.lockCpaReloginQueueEntry(successQueue, {
    run: 2,
    attempt: 1,
    now: 500,
  });
  assert.equal(secondLock.email, 'two@example.edu');
});

test('CPA queue rebuild preserves terminal statuses from previous queue', () => {
  const previousQueue = helpers.markCpaReloginQueueEntry([
    { email: 'one@example.edu', status: 'running', attempts: 1, run: 1 },
    { email: 'two@example.edu', status: 'pending' },
    { email: 'three@example.edu', status: 'pending' },
  ], {
    email: 'one@example.edu',
    status: 'success',
    reason: 'imported',
    now: 500,
  });

  const nextQueue = helpers.buildCpaReloginQueue([
    { name: 'one@example.edu.json', status: 'error', status_message: '401 unauthorized' },
    { name: 'two@example.edu.json', status: 'error', status_message: '401 unauthorized' },
    { name: 'three@example.edu.json', status: 'error', status_message: '401 unauthorized' },
  ], {
    allowedDomain: 'example.edu',
    now: 600,
  });

  const merged = helpers.mergeCpaReloginQueueWithPrevious(nextQueue, previousQueue, {
    allowedDomain: 'example.edu',
  });

  assert.deepEqual(merged.map((entry) => [entry.email, entry.status]), [
    ['one@example.edu', 'success'],
    ['two@example.edu', 'pending'],
    ['three@example.edu', 'pending'],
  ]);
  const lock = helpers.lockCpaReloginQueueEntry(merged, {
    run: 2,
    attempt: 1,
    now: 700,
  });
  assert.equal(lock.email, 'two@example.edu');
});

test('CPA queue rebuild preserves success from persisted run history after reset', () => {
  const nextQueue = helpers.buildCpaReloginQueue([
    { name: 'one@example.edu.json', status: 'error', status_message: '401 unauthorized' },
    { name: 'two@example.edu.json', status: 'error', status_message: '401 unauthorized' },
    { name: 'skip@example.com.json', status: 'error', status_message: '401 unauthorized' },
  ], {
    allowedDomain: 'example.edu',
    now: 600,
  });

  const merged = helpers.mergeCpaReloginQueueWithRunHistory(nextQueue, [
    {
      email: 'one@example.edu',
      finalStatus: 'success',
      finishedAt: '2026-05-23T00:00:00.000Z',
    },
    {
      email: 'two@example.edu',
      finalStatus: 'failed',
      finishedAt: '2026-05-23T00:01:00.000Z',
    },
    {
      email: 'skip@example.com',
      finalStatus: 'success',
      finishedAt: '2026-05-23T00:02:00.000Z',
    },
  ], {
    allowedDomain: 'example.edu',
  });

  assert.deepEqual(merged.map((entry) => [entry.email, entry.status]), [
    ['one@example.edu', 'success'],
    ['two@example.edu', 'pending'],
  ]);
  const lock = helpers.lockCpaReloginQueueEntry(merged, {
    run: 2,
    attempt: 1,
    now: 700,
  });
  assert.equal(lock.email, 'two@example.edu');
});

test('OpenAI access deactivated mail is classified as banned', () => {
  const status = helpers.classifyMailMessages([
    {
      id: 1,
      subject: 'OpenAI - Access Deactivated',
      bodyPreview: 'Your account has been banned because activity violated our terms.',
    },
  ]);

  assert.equal(status.status, 'banned');
});
