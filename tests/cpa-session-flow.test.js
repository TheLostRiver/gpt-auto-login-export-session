const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { webcrypto } = require('node:crypto');

require('../data/step-definitions.js');
require('../shared/flow-capabilities.js');
require('../shared/session-to-json-converter.js');
require('../background/local-cli-proxy-api.js');
require('../background/steps/wait-registration-success.js');
require('../background/steps/open-chatgpt.js');
require('../background/steps/chatgpt-web-login.js');
require('../background/message-router.js');

const steps = globalThis.MultiPageStepDefinitions;

test('CPA Codex session flow uses relogin queue, login code, and CPA session import only', () => {
  const workflow = steps.getWorkflow({
    panelMode: 'cpa',
    plusModeEnabled: false,
    plusAccountAccessStrategy: 'cpa_codex_session',
  });

  assert.deepEqual(workflow.nodeIds, [
    'cpa-relogin-prepare',
    'open-chatgpt',
    'chatgpt-web-login',
    'fetch-login-code',
    'cpa-session-import',
  ]);
  assert.deepEqual(workflow.nodes.map((node) => [node.legacyStepId, node.nodeId, node.title]), [
    [1, 'cpa-relogin-prepare', '读取 CPA 401 并筛封禁邮件'],
    [2, 'open-chatgpt', '打开 ChatGPT 登录页'],
    [3, 'chatgpt-web-login', '按队列邮箱登录 ChatGPT'],
    [4, 'fetch-login-code', '读取邮箱验证码并提交'],
    [5, 'cpa-session-import', 'SESSION 转 JSON 自动导入 CPA'],
  ]);
});

test('CPA panel mode is locked to relogin session flow even if old OAuth state is stored', () => {
  const workflow = steps.getWorkflow({
    panelMode: 'cpa',
    plusModeEnabled: false,
    plusAccountAccessStrategy: 'oauth',
  });

  assert.deepEqual(workflow.nodeIds, [
    'cpa-relogin-prepare',
    'open-chatgpt',
    'chatgpt-web-login',
    'fetch-login-code',
    'cpa-session-import',
  ]);
});

test('session token export modes use CPA relogin and local token export', () => {
  for (const panelMode of ['account-token', 'access-token', 'session-token-bundle']) {
    const workflow = steps.getWorkflow({
      panelMode,
      plusModeEnabled: false,
      plusAccountAccessStrategy: 'oauth',
    });

    assert.deepEqual(workflow.nodeIds, [
      'cpa-relogin-prepare',
      'open-chatgpt',
      'chatgpt-web-login',
      'fetch-login-code',
      'session-token-export',
    ], panelMode);
    const expectedTitle = panelMode === 'account-token'
      ? '导出 accountToken 文件'
      : (panelMode === 'access-token'
        ? '导出 accesToken 文件'
        : '同时导出 accountToken 和 accesToken');
    assert.equal(workflow.nodes.at(-1).title, expectedTitle);
  }
});

test('Outlook pool login flow uses selected mailbox pool instead of CPA relogin queue', () => {
  const workflow = steps.getWorkflow({
    panelMode: 'cpa',
    loginFlowMode: 'outlook-pool',
    plusModeEnabled: false,
    plusAccountAccessStrategy: 'cpa_codex_session',
  });

  assert.deepEqual(workflow.nodeIds, [
    'outlook-pool-prepare',
    'open-chatgpt',
    'chatgpt-web-login',
    'fetch-login-code',
    'cpa-session-import',
  ]);
  assert.equal(workflow.nodeIds.includes('cpa-relogin-prepare'), false);
});

test('Outlook pool token export flow keeps local token export and does not use CPA relogin queue', () => {
  const workflow = steps.getWorkflow({
    panelMode: 'session-token-bundle',
    loginFlowMode: 'outlook-pool',
    plusModeEnabled: false,
    plusAccountAccessStrategy: 'cpa_codex_session',
  });

  assert.deepEqual(workflow.nodeIds, [
    'outlook-pool-prepare',
    'open-chatgpt',
    'chatgpt-web-login',
    'fetch-login-code',
    'session-token-export',
  ]);
  assert.equal(workflow.nodeIds.includes('cpa-relogin-prepare'), false);
});

test('Outlook pool login flow is available in sidepanel and preserved by capabilities', () => {
  const sidepanelHtml = fs.readFileSync(path.join(__dirname, '..', 'sidepanel/sidepanel.html'), 'utf8');
  const sidepanelJs = fs.readFileSync(path.join(__dirname, '..', 'sidepanel/sidepanel.js'), 'utf8');
  const backgroundSource = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');

  assert.match(sidepanelHtml, /<option value="outlook-pool">从选定的邮箱池里执行登录\/注册<\/option>/);
  assert.match(sidepanelJs, /selectFlow/);
  assert.match(backgroundSource, /loginFlowMode:\s*DEFAULT_LOGIN_FLOW_MODE/);
});

test('Outlook pool prepare node allocates Hotmail pool account and never prepares CPA relogin queue', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
  const fnMatch = source.match(/async function executeOutlookPoolPrepareNode[\s\S]*?\n}\n\nasync function runAutoSequenceFromNode/);
  assert.ok(fnMatch, 'executeOutlookPoolPrepareNode function should be present');
  const fn = fnMatch[0];

  assert.match(fn, /ensureHotmailAccountForFlow\(/);
  assert.match(fn, /markUsed:\s*true/);
  assert.match(fn, /account\.email/);
  assert.doesNotMatch(fn, /prepareCpaReloginQueueForAutoRun/);
  assert.match(source, /'outlook-pool-prepare': \(state\) => executeOutlookPoolPrepareNode\(state\)/);
});

test('auto-run only requires CPA queue email when chatgpt-web-login is actually backed by CPA relogin queue', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
  const fnMatch = source.match(/async function runAutoSequenceFromNodeGraph[\s\S]*?\n}\n\nasync function waitForResume/);
  assert.ok(fnMatch, 'runAutoSequenceFromNodeGraph function should be present');
  const fn = fnMatch[0];

  assert.match(fn, /await shouldRunNamedNode\('outlook-pool-prepare'\)/);
  assert.match(fn, /await executeNodeAndWaitWithAutoRunIdleLogWatchdog\('outlook-pool-prepare'/);
  assert.match(fn, /shouldUseCpaReloginQueueForAutoRun\(await getState\(\)\)/);
  assert.match(fn, /ensureCpaReloginQueueEmailReady\(targetRun, totalRuns, attemptRuns\)/);
});

test('auto-run applies selected Outlook pool flow before preparing the CPA relogin queue', async () => {
  let state = {
    panelMode: 'cpa',
    loginFlowMode: 'cpa-relogin',
    plusModeEnabled: false,
    signupMethod: 'email',
  };
  const queuePrepModes = [];
  const setStateCalls = [];
  let startedTotalRuns = 0;

  const router = globalThis.MultiPageBackgroundMessageRouter.createMessageRouter({
    addLog: async () => {},
    clearStopRequest: () => {},
    getPendingAutoRunTimerPlan: () => null,
    getState: async () => state,
    normalizeRunCount: (value) => Math.max(1, Number(value) || 1),
    prepareCpaReloginQueueForAutoRun: async () => {
      queuePrepModes.push(state.loginFlowMode);
      return { enabled: false, totalRuns: 0 };
    },
    setState: async (updates) => {
      setStateCalls.push(updates);
      state = { ...state, ...updates };
    },
    startAutoRunLoop: (totalRuns) => {
      startedTotalRuns = totalRuns;
    },
    validateAutoRunStart: () => ({ ok: true, errors: [] }),
  });

  const response = await router.handleMessage({
    type: 'AUTO_RUN',
    source: 'test',
    payload: {
      totalRuns: 1,
      loginFlowMode: 'outlook-pool',
    },
  });

  assert.equal(response.ok, true);
  assert.equal(queuePrepModes[0], 'outlook-pool');
  assert.equal(startedTotalRuns, 1);
  assert.equal(setStateCalls.some((updates) => updates.loginFlowMode === 'outlook-pool'), true);
});

test('session token export modes force SESSION JSON access strategy', () => {
  const registry = globalThis.MultiPageFlowCapabilities.createFlowCapabilityRegistry();

  for (const panelMode of ['account-token', 'access-token', 'session-token-bundle']) {
    const result = registry.resolveSidepanelCapabilities({
      panelMode,
      state: {
        panelMode,
        plusModeEnabled: false,
        plusAccountAccessStrategy: 'oauth',
        signupMethod: 'email',
      },
    });

    assert.equal(result.effectivePanelMode, panelMode);
    assert.equal(result.effectivePlusAccountAccessStrategy, 'cpa_codex_session');
    assert.deepEqual(result.availablePlusAccountAccessStrategies, ['cpa_codex_session']);
    assert.equal(result.canEditPlusAccountAccessStrategy, false);
  }
});

test('session token artifact builder creates accountToken, accesToken, or both files', async () => {
  const api = globalThis.MultiPageBackgroundLocalCliProxyApi.createLocalCliProxyApi({
    crypto: webcrypto,
    fetch: async () => ({ ok: true, text: async () => '{}' }),
  });
  const session = {
    user: { id: 'user_123', email: 'one@example.com' },
    expires: '2026-05-24T00:00:00.000Z',
    account: { id: 'acc_123', planType: 'plus' },
    accessToken: 'session-access-token',
    authProvider: 'auth0',
    sessionToken: 'session-cookie',
    rumViewTags: { light_account: { fetched: false } },
  };

  const accountOnly = await api.buildSessionTokenArtifacts({
    exportMode: 'account-token',
    pluginDir: 'D:\\Exports',
    relativeAuthDir: 'tokens',
    session,
    accessToken: 'explicit-access-token',
  });
  assert.equal(accountOnly.artifacts.length, 1);
  assert.equal(accountOnly.artifacts[0].fileName, 'accountToken-one@example.com.json');
  assert.equal(JSON.parse(accountOnly.artifacts[0].jsonText).accessToken, 'explicit-access-token');

  const accessOnly = await api.buildSessionTokenArtifacts({
    exportMode: 'access-token',
    pluginDir: 'D:\\Exports',
    relativeAuthDir: 'tokens',
    session,
    accessToken: 'explicit-access-token',
  });
  assert.equal(accessOnly.artifacts.length, 1);
  assert.equal(accessOnly.artifacts[0].fileName, 'accesToken-one@example.com.txt');
  assert.equal(accessOnly.artifacts[0].jsonText, 'explicit-access-token\n');

  const bundle = await api.buildSessionTokenArtifacts({
    exportMode: 'session-token-bundle',
    pluginDir: 'D:\\Exports',
    relativeAuthDir: 'tokens',
    session,
    accessToken: 'explicit-access-token',
  });
  assert.deepEqual(bundle.artifacts.map((artifact) => artifact.fileName), [
    'accountToken-one@example.com.json',
    'accesToken-one@example.com.txt',
  ]);
});

test('session token export step writes both files through the helper', async () => {
  const fetchCalls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    fetchCalls.push({
      url,
      body: options.body,
    });
    const payload = JSON.parse(String(options.body || '{}'));
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, filePath: payload.filePath }),
      text: async () => JSON.stringify({ ok: true, filePath: payload.filePath }),
    };
  };

  try {
    const completions = [];
    const executor = globalThis.MultiPageBackgroundStep6.createStep6Executor({
      addLog: async () => {},
      buildLocalHelperEndpoint: (baseUrl, route) => `${String(baseUrl).replace(/\/+$/g, '')}${route}`,
      chrome: {
        tabs: {
          remove: async () => null,
        },
      },
      completeNodeFromBackground: async (nodeId, payload) => {
        completions.push({ nodeId, payload });
      },
      createAutomationTab: async () => ({ id: 42 }),
      createLocalCliProxyApi: globalThis.MultiPageBackgroundLocalCliProxyApi.createLocalCliProxyApi,
      ensureContentScriptReadyOnTab: async () => {},
      getTabId: async () => 42,
      normalizeHotmailLocalBaseUrl: (value) => String(value || '').trim(),
      sendToContentScriptResilient: async () => ({
        session: {
          user: { id: 'user_123', email: 'one@example.com' },
          expires: '2026-05-24T00:00:00.000Z',
          account: { id: 'acc_123', planType: 'plus' },
          accessToken: 'session-access-token',
          sessionToken: 'session-cookie',
        },
        accessToken: 'session-access-token',
        email: 'one@example.com',
        expiresAt: '2026-05-24T00:00:00.000Z',
      }),
      sleepWithStop: async () => {},
      throwIfStopped: () => {},
    });

    await executor.executeSessionTokenExport({
      panelMode: 'session-token-bundle',
      hotmailLocalBaseUrl: 'http://localhost:3000',
      localCpaJsonPluginDir: 'D:\\Exports',
      localCpaJsonRelativeAuthDir: '.cli-proxy-api',
    });

    assert.equal(fetchCalls.length, 2);
    assert.equal(completions[0].nodeId, 'session-token-export');
    assert.deepEqual(completions[0].payload.sessionTokenExportFilePaths, [
      'D:\\Exports\\.cli-proxy-api\\accountToken-one@example.com.json',
      'D:\\Exports\\.cli-proxy-api\\accesToken-one@example.com.txt',
    ]);
    const savedPayloads = fetchCalls.map((entry) => JSON.parse(entry.body));
    assert.equal(savedPayloads[0].content.includes('session-access-token'), true);
    assert.equal(savedPayloads[1].content, 'session-access-token\n');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('saving CPA panel mode rebuilds node statuses for the CPA relogin flow', async () => {
  const cpaNodeIds = [
    'cpa-relogin-prepare',
    'open-chatgpt',
    'chatgpt-web-login',
    'fetch-login-code',
    'cpa-session-import',
  ];
  let state = {
    panelMode: 'codex',
    plusModeEnabled: false,
    plusPaymentMethod: 'paypal',
    signupMethod: 'email',
    nodeStatuses: {
      'open-chatgpt': 'pending',
      'oauth-login': 'completed',
    },
  };
  const setStateCalls = [];
  const router = globalThis.MultiPageBackgroundMessageRouter.createMessageRouter({
    addLog: async () => {},
    broadcastDataUpdate: () => {},
    buildLuckmailSessionSettingsPayload: () => ({}),
    buildPersistentSettingsPayload: (payload) => ({ ...payload }),
    clearStopRequest: () => {},
    getNodeIdsForState: (candidate) => candidate.panelMode === 'cpa'
      ? cpaNodeIds
      : ['open-chatgpt', 'oauth-login', 'fetch-login-code'],
    getStepIdsForState: () => [1, 2, 3, 4, 5],
    getState: async () => state,
    normalizeSignupMethod: () => 'email',
    resolveSignupMethod: () => 'email',
    setPersistentSettings: async () => {},
    setState: async (updates) => {
      setStateCalls.push(updates);
      state = { ...state, ...updates };
    },
    validateModeSwitch: () => ({ ok: true, errors: [], normalizedUpdates: {} }),
  });

  await router.handleMessage({
    type: 'SAVE_SETTING',
    source: 'test',
    payload: {
      panelMode: 'cpa',
      plusAccountAccessStrategy: 'cpa_codex_session',
      plusModeEnabled: false,
    },
  });

  const saveCall = setStateCalls.at(-1);
  assert.deepEqual(Object.keys(saveCall.nodeStatuses), cpaNodeIds);
  assert.equal(saveCall.nodeStatuses['chatgpt-web-login'], 'pending');
  assert.equal(saveCall.nodeStatuses['oauth-login'], undefined);
});

test('CPA panel capabilities force SESSION JSON access strategy', () => {
  const registry = globalThis.MultiPageFlowCapabilities.createFlowCapabilityRegistry();
  const result = registry.resolveSidepanelCapabilities({
    panelMode: 'cpa',
    state: {
      panelMode: 'cpa',
      plusModeEnabled: false,
      plusAccountAccessStrategy: 'oauth',
      signupMethod: 'email',
    },
  });

  assert.equal(result.effectivePlusAccountAccessStrategy, 'cpa_codex_session');
  assert.deepEqual(result.availablePlusAccountAccessStrategies, ['cpa_codex_session']);
  assert.equal(result.canEditPlusAccountAccessStrategy, false);
});

test('CPA ChatGPT web login opens ChatGPT home and does not request OAuth URL', async () => {
  const opened = [];
  const sentMessages = [];
  const completed = [];
  const executor = globalThis.MultiPageBackgroundChatGptWebLogin.createChatGptWebLoginExecutor({
    addLog: async () => {},
    completeNodeFromBackground: async (nodeId, payload) => completed.push({ nodeId, payload }),
    getErrorMessage: (error) => error?.message || String(error || ''),
    getLoginAuthStateLabel: (state) => state || 'unknown',
    getState: async () => ({
      panelMode: 'cpa',
      email: 'one@example.edu',
      accountIdentifierType: 'email',
      accountIdentifier: 'one@example.edu',
    }),
    isStep6RecoverableResult: (result) => result?.step6Outcome === 'recoverable',
    isStep6SuccessResult: (result) => result?.step6Outcome === 'success',
    reuseOrCreateTab: async (source, url, options) => {
      opened.push({ source, url, options });
      return 101;
    },
    sendToContentScriptResilient: async (source, message, options) => {
      sentMessages.push({ source, message, options });
      return {
        step6Outcome: 'success',
        state: 'verification_page',
        loginVerificationRequestedAt: 123,
      };
    },
    STEP6_MAX_ATTEMPTS: 1,
    throwIfStopped: () => {},
  });

  await executor.executeChatGptWebLogin({
    nodeId: 'chatgpt-web-login',
    visibleStep: 3,
    email: 'one@example.edu',
  });

  assert.deepEqual(opened.map((entry) => [entry.source, entry.url]), [
    ['signup-page', 'https://chatgpt.com/'],
  ]);
  assert.equal(opened[0].options.reloadIfSameUrl, true);
  assert.equal(sentMessages[0].source, 'signup-page');
  assert.equal(sentMessages[0].message.nodeId, 'chatgpt-web-login');
  assert.equal(sentMessages[0].message.payload.email, 'one@example.edu');
  assert.equal(sentMessages[0].options.timeoutMs, 180000);
  assert.equal(sentMessages[0].options.responseTimeoutMs, 30000);
  assert.deepEqual(completed, [{
    nodeId: 'chatgpt-web-login',
    payload: { loginVerificationRequestedAt: 123 },
  }]);
});

test('CPA ChatGPT web login uses the queued account email before an Outlook alias in state.email', async () => {
  const sentMessages = [];
  const executor = globalThis.MultiPageBackgroundChatGptWebLogin.createChatGptWebLoginExecutor({
    addLog: async () => {},
    completeNodeFromBackground: async () => {},
    getErrorMessage: (error) => error?.message || String(error || ''),
    getLoginAuthStateLabel: (state) => state || 'unknown',
    getState: async () => ({
      panelMode: 'cpa',
      email: 'aydanholeyfield1574+paypal1@outlook.com',
      currentCpaReloginEmail: 'aydanholeyfield1574@outlook.com',
      accountIdentifierType: 'email',
      accountIdentifier: 'aydanholeyfield1574@outlook.com',
    }),
    isStep6RecoverableResult: () => false,
    isStep6SuccessResult: () => true,
    reuseOrCreateTab: async () => 101,
    sendToContentScriptResilient: async (_source, message) => {
      sentMessages.push(message);
      return {
        step6Outcome: 'success',
        state: 'verification_page',
        loginVerificationRequestedAt: 123,
      };
    },
    STEP6_MAX_ATTEMPTS: 1,
    throwIfStopped: () => {},
  });

  await executor.executeChatGptWebLogin({
    nodeId: 'chatgpt-web-login',
    visibleStep: 3,
  });

  assert.equal(sentMessages[0].payload.email, 'aydanholeyfield1574@outlook.com');
});

test('CPA ChatGPT web login uses the selected Hotmail account email when state.email contains a stale Outlook alias', async () => {
  const sentMessages = [];
  const executor = globalThis.MultiPageBackgroundChatGptWebLogin.createChatGptWebLoginExecutor({
    addLog: async () => {},
    completeNodeFromBackground: async () => {},
    getErrorMessage: (error) => error?.message || String(error || ''),
    getLoginAuthStateLabel: (state) => state || 'unknown',
    getState: async () => ({
      panelMode: 'cpa',
      email: 'aydanholeyfield1574+paypal1@outlook.com',
      hotmailAliasEnabled: false,
      currentHotmailAccountId: 'hm-1',
      hotmailAccounts: [
        { id: 'hm-1', email: 'aydanholeyfield1574@outlook.com' },
      ],
    }),
    isStep6RecoverableResult: () => false,
    isStep6SuccessResult: () => true,
    reuseOrCreateTab: async () => 101,
    sendToContentScriptResilient: async (_source, message) => {
      sentMessages.push(message);
      return {
        step6Outcome: 'success',
        state: 'verification_page',
        loginVerificationRequestedAt: 123,
      };
    },
    STEP6_MAX_ATTEMPTS: 1,
    throwIfStopped: () => {},
  });

  await executor.executeChatGptWebLogin({
    nodeId: 'chatgpt-web-login',
    visibleStep: 3,
  });

  assert.equal(sentMessages[0].payload.email, 'aydanholeyfield1574@outlook.com');
});

test('CPA ChatGPT web login ignores Hotmail-mode queued emails that are not in the Hotmail account pool', async () => {
  const sentMessages = [];
  const executor = globalThis.MultiPageBackgroundChatGptWebLogin.createChatGptWebLoginExecutor({
    addLog: async () => {},
    completeNodeFromBackground: async () => {},
    getErrorMessage: (error) => error?.message || String(error || ''),
    getLoginAuthStateLabel: (state) => state || 'unknown',
    getState: async () => ({
      panelMode: 'cpa',
      mailProvider: 'hotmail-api',
      email: 'pool-miss@example.com',
      currentCpaReloginEmail: 'pool-miss@example.com',
      accountIdentifierType: 'email',
      accountIdentifier: 'pool-miss@example.com',
      currentHotmailAccountId: 'hm-1',
      hotmailAccounts: [
        { id: 'hm-1', email: 'pool-member@outlook.com' },
      ],
    }),
    isStep6RecoverableResult: () => false,
    isStep6SuccessResult: () => true,
    reuseOrCreateTab: async () => 101,
    sendToContentScriptResilient: async (_source, message) => {
      sentMessages.push(message);
      return {
        step6Outcome: 'success',
        state: 'verification_page',
        loginVerificationRequestedAt: 123,
      };
    },
    STEP6_MAX_ATTEMPTS: 1,
    throwIfStopped: () => {},
  });

  await executor.executeChatGptWebLogin({
    nodeId: 'chatgpt-web-login',
    visibleStep: 3,
  });

  assert.equal(sentMessages[0].payload.email, 'pool-member@outlook.com');
});

test('CPA ChatGPT web login fails in Hotmail mode when no selected account pool email exists', async () => {
  const executor = globalThis.MultiPageBackgroundChatGptWebLogin.createChatGptWebLoginExecutor({
    addLog: async () => {},
    completeNodeFromBackground: async () => {},
    getErrorMessage: (error) => error?.message || String(error || ''),
    getLoginAuthStateLabel: (state) => state || 'unknown',
    getState: async () => ({
      panelMode: 'cpa',
      mailProvider: 'hotmail-api',
      email: 'pool-miss@example.com',
      currentCpaReloginEmail: 'pool-miss@example.com',
      currentHotmailAccountId: 'missing',
      hotmailAccounts: [
        { id: 'hm-1', email: 'pool-member@outlook.com' },
      ],
    }),
    isStep6RecoverableResult: () => false,
    isStep6SuccessResult: () => true,
    reuseOrCreateTab: async () => 101,
    sendToContentScriptResilient: async () => {
      throw new Error('should not login with non-pool email');
    },
    STEP6_MAX_ATTEMPTS: 1,
    throwIfStopped: () => {},
  });

  await assert.rejects(
    () => executor.executeChatGptWebLogin({
      nodeId: 'chatgpt-web-login',
      visibleStep: 3,
    }),
    /Hotmail/
  );
});

test('CPA login-code recovery reruns ChatGPT web login instead of Codex OAuth login', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
  const fnMatch = source.match(/async function rerunStep7ForStep8Recovery[\s\S]*?\n}\n\nasync function executeStep6/);
  assert.ok(fnMatch, 'rerunStep7ForStep8Recovery function should be present');
  const fn = fnMatch[0];

  assert.match(fn, /isCpaReloginPanelMode\(getPanelMode\(initialState\)\)/);
  assert.match(fn, /chatGptWebLoginExecutor\.executeChatGptWebLogin\(loginPayload\)/);
  assert.match(fn, /step7Executor\.executeStep7\(loginPayload\)/);
});

test('step 8 Hotmail polling keeps the displayed verification email as the mailbox target', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'background/verification-flow.js'), 'utf8');
  const fnMatch = source.match(/async function resolveVerificationStep[\s\S]*?triggerPostSuccessMailboxCleanup\(step, mail\);/);
  assert.ok(fnMatch, 'resolveVerificationStep function should be present');
  const fn = fnMatch[0];

  assert.match(fn, /targetEmail:\s*options\.targetEmail\s*\|\|\s*\(step === 4/);
});

test('Hotmail polling selects the account that matches the page-displayed target email', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
  const fnMatch = source.match(/async function pollHotmailVerificationCode\(step, state, pollPayload = \{\}\) \{[\s\S]*?\n}\n\nfunction generateRandomSuffix/);
  assert.ok(fnMatch, 'pollHotmailVerificationCode function should be present');
  const fn = fnMatch[0];

  assert.match(fn, /resolveHotmailAccountForVerificationTarget\(state,\s*pollPayload\)/);
  assert.doesNotMatch(fn, /preferredAccountId:\s*state\.currentHotmailAccountId \|\| null/);
});

test('open-chatgpt closes old ChatGPT and auth tabs before opening a fresh login page', async () => {
  const events = [];
  const executor = globalThis.MultiPageBackgroundStep1.createStep1Executor({
    addLog: async () => {},
    chrome: {
      tabs: {
        query: async () => [
          { id: 11, url: 'https://chatgpt.com/' },
          { id: 12, url: 'https://auth.openai.com/log-in' },
          { id: 13, url: 'https://example.com/' },
        ],
        remove: async (ids) => events.push(['remove', ids]),
      },
      cookies: {
        getAll: async () => [],
        remove: async () => null,
      },
      browsingData: {
        removeCookies: async () => events.push(['removeCookies']),
        remove: async (_filter, dataTypes) => events.push(['removeData', dataTypes]),
      },
    },
    completeNodeFromBackground: async () => events.push(['complete']),
    openSignupEntryTab: async () => events.push(['open']),
  });

  await executor.executeStep1();

  assert.deepEqual(events[0], ['remove', [11, 12]]);
  assert.equal(events.some((event) => event[0] === 'removeData'), true);
  assert.equal(events.at(-2)[0], 'open');
  assert.equal(events.at(-1)[0], 'complete');
});
