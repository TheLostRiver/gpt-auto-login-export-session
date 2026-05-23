const assert = require('node:assert/strict');
const test = require('node:test');

require('../background/tab-runtime.js');

test('tab runtime ignores stale automationWindowId zero when opening a tab', async () => {
  const queries = [];
  const created = [];
  const stateUpdates = [];
  const runtime = globalThis.MultiPageBackgroundTabRuntime.createTabRuntime({
    addLog: async () => {},
    chrome: {
      tabs: {
        create: async (properties) => {
          created.push(properties);
          return { id: 101, windowId: 9, url: properties.url };
        },
        query: async (queryInfo) => {
          queries.push(queryInfo);
          return [];
        },
      },
    },
    getSourceLabel: () => 'ChatGPT',
    getState: async () => ({
      automationWindowId: 0,
      sourceLastUrls: {},
      tabRegistry: {},
    }),
    matchesSourceUrlFamily: () => false,
    setState: async (updates) => stateUpdates.push(updates),
    sleepWithStop: async () => {},
    STOP_ERROR_MESSAGE: 'stopped',
    throwIfStopped: () => {},
  });

  const tabId = await runtime.reuseOrCreateTab('signup-page', 'https://chatgpt.com/', {
    forceNew: true,
  });

  assert.equal(tabId, 101);
  assert.deepEqual(queries, [{}]);
  assert.deepEqual(created, [{ url: 'https://chatgpt.com/', active: true }]);
  assert.deepEqual(stateUpdates, [{ sourceLastUrls: { 'signup-page': 'https://chatgpt.com/' } }]);
});
