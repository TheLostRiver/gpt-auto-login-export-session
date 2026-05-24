(function attachKimiCpaDefaults(root, factory) {
  const api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.KimiCpaDefaults = api;
  }
})(typeof self !== 'undefined' ? self : globalThis, function createKimiCpaDefaults() {
  const PLUS_ACCOUNT_ACCESS_STRATEGY_CPA_CODEX_SESSION = 'cpa_codex_session';
  const SIGNUP_METHOD_EMAIL = 'email';
  const SESSION_TOKEN_EXPORT_PANEL_MODES = Object.freeze([
    'account-token',
    'access-token',
    'session-token-bundle',
  ]);
  const DEFAULT_LOGIN_FLOW_MODE = 'cpa-relogin';
  const LOGIN_FLOW_MODE_OUTLOOK_POOL = 'outlook-pool';

  function normalizeKimiCpaPanelMode(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized === 'cpa' || SESSION_TOKEN_EXPORT_PANEL_MODES.includes(normalized)
      ? normalized
      : 'cpa';
  }

  function normalizeKimiCpaLoginFlowMode(value = '') {
    return String(value || '').trim().toLowerCase() === LOGIN_FLOW_MODE_OUTLOOK_POOL
      ? LOGIN_FLOW_MODE_OUTLOOK_POOL
      : DEFAULT_LOGIN_FLOW_MODE;
  }

  function buildKimiCpaReloginSettingsPatch(state = {}) {
    return {
      panelMode: normalizeKimiCpaPanelMode(state?.panelMode),
      loginFlowMode: normalizeKimiCpaLoginFlowMode(state?.loginFlowMode),
      plusModeEnabled: false,
      plusAccountAccessStrategy: PLUS_ACCOUNT_ACCESS_STRATEGY_CPA_CODEX_SESSION,
      signupMethod: SIGNUP_METHOD_EMAIL,
      phoneVerificationEnabled: false,
    };
  }

  function applyKimiCpaReloginSettingsPatch(state = {}) {
    return {
      ...(state || {}),
      ...buildKimiCpaReloginSettingsPatch(state),
    };
  }

  return {
    applyKimiCpaReloginSettingsPatch,
    buildKimiCpaReloginSettingsPatch,
  };
});
