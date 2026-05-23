const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

function readSource(path) {
  return fs.readFileSync(path, 'utf8');
}

function extractFunction(source, name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers
    .map((marker) => source.indexOf(marker))
    .find((index) => index >= 0);
  if (start < 0) {
    throw new Error(`missing function ${name}`);
  }

  let parenDepth = 0;
  let signatureEnded = false;
  let braceStart = -1;
  for (let index = start; index < source.length; index += 1) {
    const ch = source[index];
    if (ch === '(') parenDepth += 1;
    if (ch === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) signatureEnded = true;
    }
    if (ch === '{' && signatureEnded) {
      braceStart = index;
      break;
    }
  }

  let depth = 0;
  let end = braceStart;
  for (; end < source.length; end += 1) {
    const ch = source[end];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }

  return source.slice(start, end);
}

test('sidepanel does not attach stale window id zero to automation messages', async () => {
  const source = readSource('sidepanel/sidepanel.js');
  const bundle = [
    extractFunction(source, 'normalizeAutomationWindowId'),
    extractFunction(source, 'getCurrentSidepanelWindowId'),
    extractFunction(source, 'shouldAttachAutomationWindow'),
    extractFunction(source, 'sendSidepanelMessage'),
  ].join('\n');

  const api = new Function(`
let latestState = { automationWindowId: 0 };
const sent = [];
const chrome = {
  windows: {
    async getCurrent() {
      return { id: 0 };
    },
  },
  runtime: {
    async sendMessage(message) {
      sent.push(message);
      return { ok: true };
    },
  },
};
const console = { warn() {} };
function syncLatestState(patch) {
  latestState = { ...latestState, ...patch };
}
${bundle}
return {
  sendSidepanelMessage,
  sent,
  getLatestState() {
    return latestState;
  },
};
`)();

  await api.sendSidepanelMessage({
    type: 'AUTO_RUN',
    source: 'sidepanel',
    payload: { totalRuns: 1 },
  });

  assert.equal(api.sent[0].payload.automationWindowId, undefined);
  assert.equal(api.getLatestState().automationWindowId, 0);
});

test('sidepanel attaches positive current window id to automation messages', async () => {
  const source = readSource('sidepanel/sidepanel.js');
  const bundle = [
    extractFunction(source, 'normalizeAutomationWindowId'),
    extractFunction(source, 'getCurrentSidepanelWindowId'),
    extractFunction(source, 'shouldAttachAutomationWindow'),
    extractFunction(source, 'sendSidepanelMessage'),
  ].join('\n');

  const api = new Function(`
let latestState = {};
const sent = [];
const chrome = {
  windows: {
    async getCurrent() {
      return { id: 321 };
    },
  },
  runtime: {
    async sendMessage(message) {
      sent.push(message);
      return { ok: true };
    },
  },
};
const console = { warn() {} };
function syncLatestState(patch) {
  latestState = { ...latestState, ...patch };
}
${bundle}
return {
  sendSidepanelMessage,
  sent,
  getLatestState() {
    return latestState;
  },
};
`)();

  await api.sendSidepanelMessage({
    type: 'AUTO_RUN',
    source: 'sidepanel',
    payload: { totalRuns: 1 },
  });

  assert.equal(api.sent[0].payload.automationWindowId, 321);
  assert.equal(api.getLatestState().automationWindowId, 321);
});

test('message router ignores stale automation window id zero', async () => {
  const source = readSource('background/message-router.js');
  const bundle = [
    extractFunction(source, 'normalizeAutomationWindowId'),
    extractFunction(source, 'resolveAutomationWindowIdFromMessage'),
    extractFunction(source, 'lockAutomationWindowFromMessage'),
  ].join('\n');

  const api = new Function(`
const updates = [];
async function setState(update) {
  updates.push(update);
}
${bundle}
return {
  lockAutomationWindowFromMessage,
  updates,
};
`)();

  const windowId = await api.lockAutomationWindowFromMessage({
    payload: { automationWindowId: 0 },
  });

  assert.equal(windowId, null);
  assert.deepEqual(api.updates, []);
});

test('ip proxy window scope treats stale window id zero as unscoped', () => {
  const source = readSource('background/ip-proxy-core.js');
  const api = new Function(`
${extractFunction(source, 'normalizeAutomationWindowId')}
return { normalizeAutomationWindowId };
`)();

  assert.equal(api.normalizeAutomationWindowId(0), null);
  assert.equal(api.normalizeAutomationWindowId('0'), null);
  assert.equal(api.normalizeAutomationWindowId(15), 15);
});
