(function attachLoginConfigEmailList(root, factory) {
  root.MultiPageLoginConfigEmailList = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createLoginConfigEmailListModule() {
  const DEFAULT_CONFIG_PATH = 'data/kimi-cpa-relogin-emails.txt';

  function normalizeAllowedDomain(value = '') {
    return String(value || '').trim().toLowerCase().replace(/^@+/, '');
  }

  function normalizeEmail(value = '') {
    return String(value || '').trim().toLowerCase();
  }

  function isValidEmail(value = '') {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
  }

  function parseLoginConfigEmailList(text = '', options = {}) {
    const allowedDomain = normalizeAllowedDomain(options.allowedDomain);
    const seen = new Set();
    const emails = [];

    for (const rawLine of String(text || '').split(/\r?\n/)) {
      const withoutBom = String(rawLine || '').replace(/^\uFEFF/, '');
      const line = withoutBom.replace(/\s+#.*$/, '').trim();
      if (!line || line.startsWith('#')) {
        continue;
      }

      const email = normalizeEmail(line.split(/[\s,;]+/)[0]);
      if (!email || !isValidEmail(email)) {
        continue;
      }
      if (allowedDomain && !email.endsWith(`@${allowedDomain}`)) {
        continue;
      }
      if (seen.has(email)) {
        continue;
      }

      seen.add(email);
      emails.push(email);
    }

    return emails;
  }

  function createLoginConfigEmailListReader(deps = {}) {
    const chromeApi = deps.chrome || (typeof chrome !== 'undefined' ? chrome : null);
    const fetchImpl = deps.fetch || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    const configPath = String(deps.configPath || DEFAULT_CONFIG_PATH).trim() || DEFAULT_CONFIG_PATH;
    const allowedDomain = deps.allowedDomain || '';
    let cachedEmails = null;

    async function read(options = {}) {
      if (cachedEmails && !options.force) {
        return [...cachedEmails];
      }
      if (typeof fetchImpl !== 'function') {
        throw new Error('配置邮箱读取失败：当前环境不支持 fetch。');
      }

      const url = chromeApi?.runtime?.getURL
        ? chromeApi.runtime.getURL(configPath)
        : configPath;
      const response = await fetchImpl(url, { cache: 'no-store' });
      if (!response || response.ok === false) {
        const status = response?.status ? `HTTP ${response.status}` : '无响应';
        throw new Error(`配置邮箱读取失败：${status}`);
      }

      const text = typeof response.text === 'function' ? await response.text() : '';
      cachedEmails = parseLoginConfigEmailList(text, { allowedDomain });
      return [...cachedEmails];
    }

    async function getEmailForRun(targetRun, options = {}) {
      const emails = await read(options);
      const runIndex = Math.max(1, Math.floor(Number(targetRun) || 1)) - 1;
      return emails[runIndex] || '';
    }

    return {
      read,
      getEmailForRun,
      clearCache() {
        cachedEmails = null;
      },
      get configPath() {
        return configPath;
      },
    };
  }

  function normalizeQueueStatus(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    return ['pending', 'running', 'success', 'failed', 'stopped'].includes(normalized)
      ? normalized
      : 'pending';
  }

  function normalizeLoginConfigEmailQueue(queue = [], options = {}) {
    const allowedDomain = normalizeAllowedDomain(options.allowedDomain);
    const seen = new Set();
    const entries = [];

    for (const rawEntry of Array.isArray(queue) ? queue : []) {
      const email = normalizeEmail(rawEntry?.email || rawEntry);
      if (!email || !isValidEmail(email)) {
        continue;
      }
      if (allowedDomain && !email.endsWith(`@${allowedDomain}`)) {
        continue;
      }
      if (seen.has(email)) {
        continue;
      }
      seen.add(email);
      entries.push({
        id: String(rawEntry?.id || `login-config-${entries.length + 1}`),
        email,
        status: normalizeQueueStatus(rawEntry?.status),
        attempts: Math.max(0, Math.floor(Number(rawEntry?.attempts) || 0)),
        run: Math.max(0, Math.floor(Number(rawEntry?.run) || 0)),
        reason: String(rawEntry?.reason || '').trim(),
        createdAt: Math.max(0, Math.floor(Number(rawEntry?.createdAt) || 0)),
        updatedAt: Math.max(0, Math.floor(Number(rawEntry?.updatedAt) || 0)),
      });
    }

    return entries;
  }

  function buildLoginConfigEmailQueue(emails = [], options = {}) {
    const now = Math.max(0, Math.floor(Number(options.now) || Date.now()));
    return parseLoginConfigEmailList(Array.isArray(emails) ? emails.join('\n') : emails, options)
      .map((email, index) => ({
        id: `login-config-${index + 1}`,
        email,
        status: 'pending',
        attempts: 0,
        run: 0,
        reason: '',
        createdAt: now,
        updatedAt: now,
      }));
  }

  function lockLoginConfigEmailQueueEntry(queue = [], options = {}) {
    const run = Math.max(1, Math.floor(Number(options.run) || 1));
    const attempt = Math.max(1, Math.floor(Number(options.attempt) || 1));
    const now = Math.max(0, Math.floor(Number(options.now) || Date.now()));
    const entries = normalizeLoginConfigEmailQueue(queue, options);
    const runningIndex = entries.findIndex((entry) => entry.status === 'running' && entry.run === run);
    const targetIndex = runningIndex >= 0
      ? runningIndex
      : entries.findIndex((entry) => entry.status === 'pending');

    if (targetIndex < 0) {
      return {
        email: '',
        queue: entries,
        index: -1,
        remaining: entries.filter((entry) => entry.status === 'pending').length,
      };
    }

    const nextEntries = entries.map((entry, index) => {
      if (index !== targetIndex) {
        return entry;
      }
      return {
        ...entry,
        status: 'running',
        attempts: Math.max(entry.attempts, attempt),
        run,
        reason: '',
        updatedAt: now,
      };
    });

    return {
      email: nextEntries[targetIndex].email,
      queue: nextEntries,
      index: targetIndex,
      remaining: nextEntries.filter((entry) => entry.status === 'pending').length,
    };
  }

  function markLoginConfigEmailQueueEntry(queue = [], options = {}) {
    const targetEmail = normalizeEmail(options.email);
    const status = normalizeQueueStatus(options.status);
    const reason = String(options.reason || '').trim();
    const now = Math.max(0, Math.floor(Number(options.now) || Date.now()));
    const entries = normalizeLoginConfigEmailQueue(queue, options);
    const targetIndex = targetEmail
      ? entries.findIndex((entry) => entry.email === targetEmail)
      : entries.findIndex((entry) => entry.status === 'running');

    if (targetIndex < 0) {
      return entries;
    }

    return entries.map((entry, index) => {
      if (index !== targetIndex) {
        return entry;
      }
      return {
        ...entry,
        status,
        reason,
        updatedAt: now,
      };
    });
  }

  return {
    DEFAULT_CONFIG_PATH,
    parseLoginConfigEmailList,
    createLoginConfigEmailListReader,
    normalizeLoginConfigEmailQueue,
    buildLoginConfigEmailQueue,
    lockLoginConfigEmailQueueEntry,
    markLoginConfigEmailQueueEntry,
  };
});
