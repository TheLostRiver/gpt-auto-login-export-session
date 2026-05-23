const assert = require('node:assert/strict');
const test = require('node:test');

const mailProviderUtils = require('../mail-provider-utils.js');

test('icloud forward mail provider supports Outlook/Hotmail', () => {
  const options = mailProviderUtils.getIcloudForwardMailProviderOptions();
  const hotmailOption = options.find((option) => option.value === 'hotmail-api');

  assert.ok(hotmailOption);
  assert.equal(mailProviderUtils.normalizeIcloudForwardMailProvider('hotmail-api'), 'hotmail-api');

  const config = mailProviderUtils.getIcloudForwardMailConfig('hotmail-api');
  assert.equal(config.provider, 'hotmail-api');
  assert.match(config.label, /Hotmail/);
});
