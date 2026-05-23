(function attachCpaReloginQueue(root, factory) {
  root.MultiPageCpaReloginQueue = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createCpaReloginQueueModule() {
  const DEFAULT_SOURCE = 'cpa-401';

  function normalizeAllowedDomain(value = '') {
    return String(value || '').trim().toLowerCase().replace(/^@+/, '');
  }

  function normalizeEmail(value = '') {
    return String(value || '').trim().toLowerCase();
  }

  function isValidEmail(value = '') {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
  }

  function matchesAllowedDomain(email = '', allowedDomain = '') {
    const normalizedDomain = normalizeAllowedDomain(allowedDomain);
    return !normalizedDomain || normalizeEmail(email).endsWith(`@${normalizedDomain}`);
  }

  function normalizeStatus(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    return ['pending', 'running', 'success', 'failed', 'stopped', 'banned'].includes(normalized)
      ? normalized
      : 'pending';
  }

  function getFirstText(...values) {
    for (const value of values) {
      const text = String(value || '').trim();
      if (text) {
        return text;
      }
    }
    return '';
  }

  function extractCpaEmail(item = {}) {
    for (const key of ['email', 'account', 'username']) {
      const value = normalizeEmail(item?.[key]);
      if (isValidEmail(value)) {
        return value;
      }
    }
    let name = getFirstText(item?.name, item?.id);
    if (name.toLowerCase().endsWith('.json')) {
      name = name.slice(0, -5);
    }
    const email = normalizeEmail(name);
    return isValidEmail(email) ? email : '';
  }

  function stringifyStatusSource(item = {}) {
    const parts = [
      item?.status,
      item?.status_message,
      item?.message,
      item?.error,
      item?.probe?.status_code,
      item?.probe?.statusCode,
      item?.probe?.error,
      item?.probe?.raw,
    ];
    return parts.map((value) => String(value || '')).join(' ').toLowerCase();
  }

  function classifyCpaAuthFile(item = {}) {
    const status = String(item?.status || '').trim().toLowerCase();
    const text = stringifyStatusSource(item);
    if (
      /\b401\b|unauthorized|auth_unavailable|authentication token has been invalidated|token has been invalidated|refresh_token_expired|refresh token expired|refresh_token_reused|refresh_token_invalidated|invalid_grant/.test(text)
      || /\bbanned\b|\bsuspended\b|\bdeactivated\b|\bterminated\b|account closed|account_locked|fraud|abuse|违反|封禁/.test(text)
      || Number(item?.probe?.status_code) === 401
      || Number(item?.probe?.statusCode) === 401
      || status === 'disabled'
      || status === 'unavailable'
      || item?.disabled === true
      || item?.unavailable === true
    ) {
      return 'token_invalid';
    }
    if (status === 'active' || status === 'ok') {
      return 'active';
    }
    if (/timeout|temporarily|context canceled/.test(text)) {
      return 'transient';
    }
    return status || 'unknown';
  }

  function stringifyMailMessage(message = {}) {
    if (typeof message === 'string') {
      return message;
    }
    if (!message || typeof message !== 'object') {
      return '';
    }
    return [
      message.subject,
      message.raw,
      message.body,
      message.text,
      message.html,
      message.bodyPreview,
      message.content,
      message.source,
      message.from,
      message.sender,
    ].map((value) => {
      if (value && typeof value === 'object') {
        return JSON.stringify(value);
      }
      return String(value || '');
    }).join('\n');
  }

  function classifyMailRaw(raw = '') {
    const text = String(raw || '').toLowerCase();
    if (
      /access deactivated|account has been banned|account has been suspended|can no longer be used|violated our terms|violated our usage policies|start an appeal|账号.*(?:封禁|停用)|访问.*停用/.test(text)
    ) {
      return 'banned';
    }
    return 'unknown';
  }

  function classifyMailMessages(messages = []) {
    for (const message of Array.isArray(messages) ? messages : []) {
      const raw = stringifyMailMessage(message);
      if (classifyMailRaw(raw) === 'banned') {
        return {
          status: 'banned',
          reason: 'access deactivated mail found',
          mailId: message?.id || message?.mail_id || '',
          createdAt: message?.created_at || message?.receivedDateTime || '',
        };
      }
    }
    return {
      status: 'unknown',
      reason: '',
      mailCount: Array.isArray(messages) ? messages.length : 0,
    };
  }

  function normalizeMailStatusMap(value = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return Object.fromEntries(Object.entries(value).map(([email, status]) => [
      normalizeEmail(email),
      status && typeof status === 'object' ? status : { status: String(status || '') },
    ]).filter(([email]) => isValidEmail(email)));
  }

  function createQueueEntry(email, item = {}, options = {}) {
    const now = Math.max(0, Math.floor(Number(options.now) || Date.now()));
    const status = normalizeStatus(options.status);
    return {
      id: String(options.id || `${DEFAULT_SOURCE}-${email}`),
      email,
      status,
      attempts: Math.max(0, Math.floor(Number(options.attempts) || 0)),
      run: Math.max(0, Math.floor(Number(options.run) || 0)),
      reason: String(options.reason || '').trim(),
      source: String(options.source || DEFAULT_SOURCE),
      cpaName: getFirstText(item?.name, item?.id),
      cpaAuthIndex: getFirstText(item?.auth_index, item?.authIndex),
      cpaAccountId: getFirstText(item?.account_id, item?.chatgpt_account_id),
      mail: options.mail || null,
      createdAt: Math.max(0, Math.floor(Number(options.createdAt) || now)),
      updatedAt: Math.max(0, Math.floor(Number(options.updatedAt) || now)),
    };
  }

  function normalizeCpaReloginQueue(queue = [], options = {}) {
    const allowedDomain = normalizeAllowedDomain(options.allowedDomain);
    const seen = new Set();
    const entries = [];
    for (const rawEntry of Array.isArray(queue) ? queue : []) {
      const email = normalizeEmail(rawEntry?.email || rawEntry);
      if (!isValidEmail(email) || !matchesAllowedDomain(email, allowedDomain) || seen.has(email)) {
        continue;
      }
      seen.add(email);
      entries.push(createQueueEntry(email, rawEntry, {
        ...rawEntry,
        status: rawEntry?.status,
        reason: rawEntry?.reason,
        source: rawEntry?.source || DEFAULT_SOURCE,
        mail: rawEntry?.mail || null,
      }));
    }
    return entries;
  }

  function buildCpaReloginQueue(authFiles = [], options = {}) {
    const allowedDomain = normalizeAllowedDomain(options.allowedDomain);
    const mailStatuses = normalizeMailStatusMap(options.mailStatuses);
    const now = Math.max(0, Math.floor(Number(options.now) || Date.now()));
    const seen = new Set();
    const entries = [];

    for (const item of Array.isArray(authFiles) ? authFiles : []) {
      const email = extractCpaEmail(item);
      if (!email || !matchesAllowedDomain(email, allowedDomain) || seen.has(email)) {
        continue;
      }
      seen.add(email);

      const cpaStatus = classifyCpaAuthFile(item);
      if (cpaStatus !== 'token_invalid') {
        continue;
      }

      const mailStatus = mailStatuses[email] || null;
      const isBanned = String(mailStatus?.status || '').trim().toLowerCase() === 'banned';
      entries.push(createQueueEntry(email, item, {
        now,
        status: isBanned ? 'banned' : 'pending',
        reason: isBanned
          ? (String(mailStatus?.reason || '').trim() || 'banned by mail')
          : '',
        mail: mailStatus,
      }));
    }

    return entries;
  }

  function lockCpaReloginQueueEntry(queue = [], options = {}) {
    const run = Math.max(1, Math.floor(Number(options.run) || 1));
    const attempt = Math.max(1, Math.floor(Number(options.attempt) || 1));
    const now = Math.max(0, Math.floor(Number(options.now) || Date.now()));
    const entries = normalizeCpaReloginQueue(queue, options);
    const runningIndex = entries.findIndex((entry) => entry.status === 'running' && entry.run === run);
    const targetIndex = runningIndex >= 0
      ? runningIndex
      : entries.findIndex((entry) => entry.status === 'pending');

    if (targetIndex < 0) {
      return { email: '', queue: entries, index: -1, remaining: 0 };
    }

    const nextQueue = entries.map((entry, index) => {
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
      email: nextQueue[targetIndex].email,
      queue: nextQueue,
      index: targetIndex,
      remaining: nextQueue.filter((entry) => entry.status === 'pending').length,
    };
  }

  function markCpaReloginQueueEntry(queue = [], options = {}) {
    const email = normalizeEmail(options.email);
    const status = normalizeStatus(options.status);
    const reason = String(options.reason || '').trim();
    const now = Math.max(0, Math.floor(Number(options.now) || Date.now()));
    const entries = normalizeCpaReloginQueue(queue, options);
    const targetIndex = email
      ? entries.findIndex((entry) => entry.email === email)
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

  function mergeCpaReloginQueueWithPrevious(nextQueue = [], previousQueue = [], options = {}) {
    const nextEntries = normalizeCpaReloginQueue(nextQueue, options);
    const previousEntries = normalizeCpaReloginQueue(previousQueue, options);
    const previousByEmail = new Map(previousEntries.map((entry) => [entry.email, entry]));
    const terminalStatuses = new Set(['success', 'failed', 'stopped', 'banned']);

    return nextEntries.map((entry) => {
      const previous = previousByEmail.get(entry.email);
      if (!previous || !terminalStatuses.has(previous.status) || entry.status === 'banned') {
        return entry;
      }
      return {
        ...entry,
        status: previous.status,
        attempts: Math.max(entry.attempts, previous.attempts),
        run: Math.max(entry.run, previous.run),
        reason: previous.reason || entry.reason,
        updatedAt: Math.max(entry.updatedAt, previous.updatedAt),
      };
    });
  }

  function mergeCpaReloginQueueWithRunHistory(nextQueue = [], runHistory = [], options = {}) {
    const nextEntries = normalizeCpaReloginQueue(nextQueue, options);
    const allowedDomain = normalizeAllowedDomain(options.allowedDomain);
    const successByEmail = new Map();

    for (const record of Array.isArray(runHistory) ? runHistory : []) {
      const email = normalizeEmail(record?.email || record?.accountIdentifier);
      if (!isValidEmail(email) || !matchesAllowedDomain(email, allowedDomain) || successByEmail.has(email)) {
        continue;
      }
      if (String(record?.finalStatus || record?.status || '').trim().toLowerCase() !== 'success') {
        continue;
      }
      successByEmail.set(email, record);
    }

    if (!successByEmail.size) {
      return nextEntries;
    }

    return nextEntries.map((entry) => {
      const record = successByEmail.get(entry.email);
      if (!record || entry.status === 'banned') {
        return entry;
      }
      const finishedAt = Date.parse(String(record?.finishedAt || record?.recordedAt || ''));
      return {
        ...entry,
        status: 'success',
        reason: String(record?.failureDetail || record?.reason || 'account run history success').trim(),
        updatedAt: Number.isFinite(finishedAt) ? Math.max(entry.updatedAt, finishedAt) : entry.updatedAt,
      };
    });
  }

  function getRunnableCpaReloginEmails(queue = []) {
    return normalizeCpaReloginQueue(queue)
      .filter((entry) => entry.status === 'pending' || entry.status === 'running')
      .map((entry) => entry.email);
  }

  function getCpaReloginQueueCounts(queue = []) {
    const counts = {};
    for (const entry of normalizeCpaReloginQueue(queue)) {
      counts[entry.status] = (counts[entry.status] || 0) + 1;
    }
    return counts;
  }

  return {
    classifyCpaAuthFile,
    classifyMailMessages,
    classifyMailRaw,
    extractCpaEmail,
    buildCpaReloginQueue,
    normalizeCpaReloginQueue,
    lockCpaReloginQueueEntry,
    markCpaReloginQueueEntry,
    mergeCpaReloginQueueWithPrevious,
    mergeCpaReloginQueueWithRunHistory,
    getRunnableCpaReloginEmails,
    getCpaReloginQueueCounts,
  };
});
