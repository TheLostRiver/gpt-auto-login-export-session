# CpaSessionGate AI Quick Config

This package is a sanitized Chrome extension for the CPA 401 relogin flow. It does not include any CPA URL, management key, mail API credential, private email domain, account list, or run history.

## What This Extension Does

1. Reads 401 / invalid-session accounts from the configured CPA management service.
2. Optionally limits the queue to one configured email domain.
3. Checks mailbox messages for ban / deactivation notices and skips banned accounts.
4. Logs in to the ChatGPT web page with the queued email.
5. Fetches the login code from the configured mail API.
6. Extracts the web SESSION payload.
7. Imports SESSION JSON back into CPA.
8. Marks successful emails so the next run continues with the next account.

## Required Values

Fill these values before running automation:

```text
CPA_MANAGEMENT_URL=https://your-cpa-host.example/management.html#/monitoring/codex-inspection
CPA_MANAGEMENT_KEY=YOUR_MANAGEMENT_KEY
TEMP_MAIL_API_BASE_URL=https://your-mail-api.example
TEMP_MAIL_ADMIN_AUTH=YOUR_MAIL_ADMIN_AUTH
TEMP_MAIL_DOMAIN=example.edu
```

`TEMP_MAIL_DOMAIN` is optional. If set, only accounts under that domain are processed and imported. If left blank, the extension will not enforce a domain filter.

## Manual Setup

1. Open Chrome extensions: `chrome://extensions`.
2. Enable Developer mode.
3. Load the unpacked extension directory, or drag the CRX into Chrome if CRX installation is allowed.
4. Open the extension side panel.
5. Keep the mode as `CPA账号重登`.
6. Fill these fields:
   - `CPA 管理密钥`: `CPA_MANAGEMENT_KEY`
   - `CPA 面板`: `CPA_MANAGEMENT_URL`
   - `Cloudflare Temp Email API`: `TEMP_MAIL_API_BASE_URL`
   - `Admin Auth`: `TEMP_MAIL_ADMIN_AUTH`
   - `TEMP 域名`: `TEMP_MAIL_DOMAIN`
7. Save settings.
8. Click `自动` to start the queue.

## AI Operator Prompt

Give this prompt to an AI agent that has access to the target browser or remote machine:

```text
Configure and run the CpaSessionGate Chrome extension.

Use these values:
- CPA management URL: <CPA_MANAGEMENT_URL>
- CPA management key: <CPA_MANAGEMENT_KEY>
- temp mail API base URL: <TEMP_MAIL_API_BASE_URL>
- temp mail admin auth: <TEMP_MAIL_ADMIN_AUTH>
- temp mail domain filter: <TEMP_MAIL_DOMAIN or blank>

Requirements:
1. Do not use any hardcoded old credentials.
2. Keep Plus/payment/registration flows disabled.
3. Use the CPA relogin flow only:
   read CPA 401 accounts -> skip banned emails -> login ChatGPT web -> fetch email code -> extract SESSION JSON -> import CPA.
4. Clear ChatGPT/OpenAI cookies before each account login.
5. Close stale ChatGPT/Auth tabs before the next account.
6. Confirm the first successful account is marked success and the next run locks a different pending account.
7. Report the success list, banned list, pending count, and any failed accounts.
```

## Verification Checklist

Run these checks after configuration:

```text
1. Side panel shows exactly 5 CPA relogin steps.
2. Body text does not show Plus payment or registration as active steps.
3. Queue counts include pending and banned accounts after prepare.
4. After one success, the queue marks that email as success.
5. After restart or reset plus prepare, the same success email is not returned to pending.
6. The next automatic run locks the next pending email.
```

## Notes

- The extension stores run history in Chrome extension storage and may sync a local helper snapshot if that helper is enabled.
- The packaged clean build intentionally does not include an account list. CPA relogin should read accounts from the CPA management API.
- If you want a fixed local fallback email list, edit `data/kimi-cpa-relogin-emails.txt` with one email per line before packaging.
