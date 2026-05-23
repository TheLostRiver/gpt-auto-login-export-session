# Session Token Export Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three export targets that write ChatGPT session JSON, accessToken text, or both as local files per account.

**Architecture:** Add three panel modes to the existing sidepanel export target system. Reuse the CPA relogin sequence for login and replace the final CPA import node with a local session token export node that writes files through the existing local helper save endpoint.

**Tech Stack:** Chrome extension service worker/content scripts, plain JavaScript modules loaded via `importScripts`, Node built-in test runner.

---

### Task 1: Failing Tests

**Files:**
- Modify: `tests/cpa-session-flow.test.js`
- Test: `tests/cpa-session-flow.test.js`

- [ ] **Step 1: Add tests for token export modes**

Add tests asserting the three new panel modes are valid, use the CPA relogin prefix, and end with `session-token-export`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/cpa-session-flow.test.js`
Expected: FAIL because the new panel modes normalize to `cpa` and the workflow still ends with `cpa-session-import`.

### Task 2: Mode Capabilities And Workflow

**Files:**
- Modify: `shared/flow-capabilities.js`
- Modify: `data/step-definitions.js`
- Modify: `background.js`

- [ ] **Step 1: Add mode constants and capabilities**

Add `account-token`, `access-token`, and `session-token-bundle` as valid panel modes with CPA-style session access strategy.

- [ ] **Step 2: Add workflow tail**

Add a `session-token-export` node and route the three new modes to the CPA relogin prefix plus that node.

- [ ] **Step 3: Register executor key**

Map `session-token-export` in `background.js` to the Step 6 executor method added in Task 3.

- [ ] **Step 4: Run tests**

Run: `node --test tests/cpa-session-flow.test.js`
Expected: PASS for mode/workflow tests.

### Task 3: Export Artifacts

**Files:**
- Modify: `background/local-cli-proxy-api.js`
- Modify: `background/steps/wait-registration-success.js`
- Test: new focused assertions in `tests/cpa-session-flow.test.js`

- [ ] **Step 1: Add failing artifact builder tests**

Assert account-token builds one JSON artifact, access-token builds one text artifact, and session-token-bundle builds both with distinct filenames.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/cpa-session-flow.test.js`
Expected: FAIL because artifact helpers do not exist yet.

- [ ] **Step 3: Implement artifact builder**

Create a `buildSessionTokenArtifacts` helper in `background/local-cli-proxy-api.js` and expose it through `createLocalCliProxyApi`.

- [ ] **Step 4: Implement executor**

Add `executeSessionTokenExport` in `background/steps/wait-registration-success.js`, using the same session reader and helper save endpoint as local CPA JSON.

- [ ] **Step 5: Run test**

Run: `node --test tests/cpa-session-flow.test.js`
Expected: PASS.

### Task 4: Sidepanel UI

**Files:**
- Modify: `sidepanel/sidepanel.html`
- Modify: `sidepanel/sidepanel.js`

- [ ] **Step 1: Add dropdown options**

Add three options under `select-panel-mode`.

- [ ] **Step 2: Update normalization and UI visibility**

Treat token export modes as local file export modes requiring plugin dir. Keep account access strategy locked to SESSION JSON for CPA/token modes, but allow changing the export target.

- [ ] **Step 3: Run syntax and tests**

Run: `node --check sidepanel/sidepanel.js`
Run: `node --test tests/cpa-session-flow.test.js`
Expected: PASS.

### Task 5: Final Verification

**Files:**
- All modified files

- [ ] **Step 1: Run broader available tests**

Run: `node --test tests/*.test.js`
Expected: PASS.

- [ ] **Step 2: Manual review**

Inspect changed files for accidental token output, unrelated edits, and broken labels.

**Git note:** This workspace has no `.git` directory, so plan/spec commits are not available here.
