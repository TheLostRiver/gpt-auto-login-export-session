(function attachBackgroundChatGptWebLogin(root, factory) {
  root.MultiPageBackgroundChatGptWebLogin = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundChatGptWebLoginModule() {
  const CHATGPT_LOGIN_ENTRY_URL = 'https://chatgpt.com/';

  function createChatGptWebLoginExecutor(deps = {}) {
    const {
      addLog,
      completeNodeFromBackground,
      getErrorMessage,
      getLoginAuthStateLabel,
      getState,
      isStep6RecoverableResult,
      isStep6SuccessResult,
      reuseOrCreateTab,
      sendToContentScriptResilient,
      SIGNUP_PAGE_INJECT_FILES = ['content/utils.js', 'content/operation-delay.js', 'content/auth-page-recovery.js', 'content/phone-country-utils.js', 'content/phone-auth.js', 'content/signup-page.js'],
      STEP6_MAX_ATTEMPTS = 3,
      throwIfStopped = () => {},
    } = deps;

    function normalizeEmail(value = '') {
      return String(value || '').trim().toLowerCase();
    }

    function resolveCurrentHotmailAccountEmail(state = {}) {
      const currentHotmailAccountId = String(state?.currentHotmailAccountId || '').trim();
      if (!currentHotmailAccountId || !Array.isArray(state?.hotmailAccounts)) {
        return '';
      }
      const account = state.hotmailAccounts.find((candidate) => (
        String(candidate?.id || '').trim() === currentHotmailAccountId
      ));
      return normalizeEmail(account?.email);
    }

    function isHotmailMailProvider(state = {}) {
      return String(state?.mailProvider || '').trim().toLowerCase() === 'hotmail-api';
    }

    function resolveLoginEmail(state = {}) {
      if (isHotmailMailProvider(state)) {
        return resolveCurrentHotmailAccountEmail(state);
      }

      return normalizeEmail(
        state?.currentCpaReloginEmail
        || state?.currentLoginConfigEmail
        || (
          String(state?.accountIdentifierType || '').trim().toLowerCase() === 'email'
            ? state?.accountIdentifier
            : ''
        )
        || resolveCurrentHotmailAccountEmail(state)
        || state?.registrationEmailState?.current
        || state?.email
      );
    }

    function resolveVisibleStep(state = {}) {
      const visibleStep = Math.floor(Number(state?.visibleStep) || 0);
      return visibleStep > 0 ? visibleStep : 3;
    }

    function getResultState(result = {}) {
      return String(result?.state || '').trim();
    }

    function buildCompletionPayload(result = {}) {
      return {
        loginVerificationRequestedAt: result.loginVerificationRequestedAt || null,
      };
    }

    async function executeChatGptWebLogin(state = {}) {
      const initialState = typeof getState === 'function'
        ? {
          ...(state || {}),
          ...(await getState().catch(() => ({}))),
        }
        : (state || {});
      const visibleStep = resolveVisibleStep(initialState);
      const email = resolveLoginEmail(initialState);
      if (!email) {
        if (isHotmailMailProvider(initialState)) {
          throw new Error(`步骤 ${visibleStep}：Hotmail/Outlook 邮箱模式缺少账号池中的当前账号邮箱，已停止登录以避免使用池外邮箱。`);
        }
        throw new Error(`步骤 ${visibleStep}：缺少 CPA 重登邮箱，无法打开 ChatGPT 网页登录。`);
      }

      let attempt = 0;
      let lastError = null;

      while (attempt < STEP6_MAX_ATTEMPTS) {
        throwIfStopped();
        attempt += 1;
        try {
          const currentState = attempt === 1
            ? initialState
            : {
              ...(await getState().catch(() => ({}))),
              email,
              accountIdentifierType: 'email',
              accountIdentifier: email,
            };
          const password = currentState.password || currentState.customPassword || '';

          await addLog(
            attempt === 1
              ? `步骤 ${visibleStep}：正在打开 ChatGPT 网页并使用 ${email} 登录...`
              : `步骤 ${visibleStep}：正在重新打开 ChatGPT 网页登录（第 ${attempt}/${STEP6_MAX_ATTEMPTS} 次）...`,
            attempt === 1 ? 'info' : 'warn',
            { step: visibleStep, stepKey: state?.nodeId || 'chatgpt-web-login' }
          );

          await reuseOrCreateTab('signup-page', CHATGPT_LOGIN_ENTRY_URL, {
            inject: SIGNUP_PAGE_INJECT_FILES,
            injectSource: 'signup-page',
            reloadIfSameUrl: true,
          });

          const loginTimeoutMs = 180000;
          const singlePageResponseTimeoutMs = 30000;
          const result = await sendToContentScriptResilient(
            'signup-page',
            {
              type: 'EXECUTE_NODE',
              nodeId: 'chatgpt-web-login',
              step: visibleStep,
              source: 'background',
              payload: {
                email,
                accountIdentifier: email,
                loginIdentifierType: 'email',
                password,
                visibleStep,
                stepKey: 'chatgpt-web-login',
              },
            },
            {
              timeoutMs: loginTimeoutMs,
              responseTimeoutMs: singlePageResponseTimeoutMs,
              retryDelayMs: 700,
              logMessage: 'ChatGPT 登录页正在切换，等待页面重新就绪后继续登录...',
              logStep: visibleStep,
              logStepKey: 'chatgpt-web-login',
            }
          );

          if (result?.error) {
            throw new Error(result.error);
          }

          if (isStep6SuccessResult(result)) {
            if (result?.directOAuthConsentPage || getResultState(result) === 'oauth_consent_page') {
              throw new Error(`步骤 ${visibleStep}：CPA 重登只允许 ChatGPT 网页登录，但当前进入了 OAuth 授权页。URL: ${result?.url || ''}`.trim());
            }
            if (result?.addEmailPage || getResultState(result) === 'add_email_page') {
              throw new Error(`步骤 ${visibleStep}：CPA 重登邮箱登录不应进入添加邮箱页。URL: ${result?.url || ''}`.trim());
            }
            await completeNodeFromBackground(state?.nodeId || 'chatgpt-web-login', buildCompletionPayload(result));
            return;
          }

          if (isStep6RecoverableResult(result)) {
            const reasonMessage = result.message
              || `当前停留在${getLoginAuthStateLabel(result.state)}，准备重新执行步骤 ${visibleStep}。`;
            throw new Error(reasonMessage);
          }

          throw new Error(`步骤 ${visibleStep}：ChatGPT 网页登录未返回可识别结果。`);
        } catch (err) {
          throwIfStopped(err);
          lastError = err;
          if (attempt >= STEP6_MAX_ATTEMPTS) {
            break;
          }
          await addLog(`步骤 ${visibleStep}：ChatGPT 网页登录第 ${attempt} 次失败：${getErrorMessage(err)}，准备重试...`, 'warn', {
            step: visibleStep,
            stepKey: 'chatgpt-web-login',
          });
        }
      }

      throw new Error(`步骤 ${visibleStep}：ChatGPT 网页登录已重试 ${STEP6_MAX_ATTEMPTS} 次仍失败。最后原因：${getErrorMessage(lastError)}`);
    }

    return { executeChatGptWebLogin };
  }

  return { createChatGptWebLoginExecutor };
});
