const assert = require('node:assert/strict');
const test = require('node:test');

const kimiCpaDefaults = require('../kimi-cpa-defaults.js');

test('Kimi CPA relogin defaults preserve explicit Outlook mail provider', () => {
  const state = kimiCpaDefaults.applyKimiCpaReloginSettingsPatch({
    mailProvider: 'hotmail-api',
    emailGenerator: 'duck',
  });

  assert.equal(state.mailProvider, 'hotmail-api');
  assert.equal(state.emailGenerator, 'duck');
  assert.equal(state.panelMode, 'cpa');
  assert.equal(state.plusModeEnabled, false);
  assert.equal(state.plusAccountAccessStrategy, 'cpa_codex_session');
});

test('Kimi CPA relogin defaults preserve session token export panel modes', () => {
  for (const panelMode of ['account-token', 'access-token', 'session-token-bundle']) {
    const state = kimiCpaDefaults.applyKimiCpaReloginSettingsPatch({
      panelMode,
    });

    assert.equal(state.panelMode, panelMode);
    assert.equal(state.plusModeEnabled, false);
    assert.equal(state.plusAccountAccessStrategy, 'cpa_codex_session');
  }
});

test('Kimi CPA relogin defaults preserve Outlook pool login flow mode', () => {
  const state = kimiCpaDefaults.applyKimiCpaReloginSettingsPatch({
    loginFlowMode: 'outlook-pool',
    mailProvider: 'hotmail-api',
  });

  assert.equal(state.panelMode, 'cpa');
  assert.equal(state.loginFlowMode, 'outlook-pool');
  assert.equal(state.mailProvider, 'hotmail-api');
});
