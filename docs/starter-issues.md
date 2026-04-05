# Starter Issues

This file contains copy-paste-ready issue drafts for the public backlog. The first four came from an outside contributor review. The remaining six are additional contributor-friendly issues based on the current product/docs surface.

Recommended default labels:

- `good first issue`
- `help wanted`
- one of `bug` or `enhancement`
- domain labels such as `ux`, `onboarding`, `docs`, or `community`

## 1. Clarify first-run setup when no model provider is configured

- Type: bug
- Labels: `bug`, `good first issue`, `help wanted`, `onboarding`, `ux`

When a new user launches OAgent without a working Ollama setup or OpenRouter key, the app can appear to be "Processing" without making it clear that setup is incomplete. That creates a false sense that a response is coming when the app is actually blocked on configuration.

Acceptance criteria:

- Detect when the active provider is missing required setup.
- Replace or supplement the generic processing state with a clear setup-required message.
- Point the user to the exact fix: add an OpenRouter key, start Ollama, or choose a configured provider.
- Cover both first-run and later misconfigured states.

## 2. Add review controls for ask-before-edits mode

- Type: enhancement
- Labels: `enhancement`, `good first issue`, `help wanted`, `ux`

In ask-before-edits mode, approving a change currently accepts the full file update at once. Contributors suggested a more reviewable flow where a user can inspect or selectively approve edits in smaller chunks.

Acceptance criteria:

- Show a structured diff before applying edits in ask-before-edits mode.
- Support at least one finer-grained review action beyond all-or-nothing approval.
- Preserve the current fast path for users who still want to approve the full edit immediately.
- Document any intentional scope limits for the first version.

## 3. Add date filters to conversation search

- Type: enhancement
- Labels: `enhancement`, `good first issue`, `help wanted`, `ux`

The session search already indexes titles and message snippets, and session metadata includes timestamps. Adding a date filter would make it much easier to narrow down older conversations.

Acceptance criteria:

- Support filtering search results by date or date range.
- Keep current keyword search behavior intact.
- Apply the filter to both session-title hits and message hits.
- Make the empty state explicit when the date range removes all matches.

## 4. Move the processing indicator closer to the active prompt

- Type: enhancement
- Labels: `enhancement`, `good first issue`, `help wanted`, `ux`

The current processing indicator is easy to miss because it sits away from the active message flow. A contributor suggested moving it under the user prompt or into the active conversation stream.

Acceptance criteria:

- Show processing state in a location visually tied to the latest user prompt.
- Preserve accessibility and avoid creating duplicate conflicting indicators.
- Validate the placement for both short and long conversations.
- Include a before/after screenshot in the PR.

## 5. Add provider health checks in Settings

- Type: enhancement
- Labels: `enhancement`, `help wanted`, `onboarding`, `ux`

The settings dialog exposes provider fields, but there is no quick way to verify whether the current OpenRouter or Ollama configuration is actually usable. A lightweight "Test connection" flow would reduce setup confusion and bug reports.

Acceptance criteria:

- Add a way to test the current provider configuration from Settings.
- Show success, failure, and actionable failure messages.
- For Ollama, distinguish between unreachable endpoint and missing model.
- Keep provider secrets out of logs and UI error details.

## 6. Improve runtime setup docs for packaged app users

- Type: docs
- Labels: `docs`, `good first issue`, `help wanted`, `onboarding`

The README explains OpenRouter and Ollama setup, but packaged-app users can still miss the fact that the app needs a configured provider before the first prompt will work. The install path should be explicit about that.

Acceptance criteria:

- Add a short first-run setup section to the README.
- Explain the difference between using OpenRouter and Ollama in plain language.
- State clearly that downloading the app is not enough by itself; one provider must be configured.
- Keep the instructions concise and screenshot-friendly.

## 7. Add an onboarding empty state for brand-new sessions

- Type: enhancement
- Labels: `enhancement`, `help wanted`, `onboarding`, `ux`

Right now, a new session relies heavily on the user already understanding models, permissions, and available tools. A stronger empty state could explain how to get from install to first successful response.

Acceptance criteria:

- Add a visible first-session empty state with setup and usage guidance.
- Surface the active provider and whether it appears ready.
- Link or point to Settings from the empty state.
- Avoid adding clutter once the user has already started chatting.

## 8. Add search result sorting and grouping

- Type: enhancement
- Labels: `enhancement`, `good first issue`, `help wanted`, `ux`

Search results are useful, but they would be easier to scan if they were grouped and sorted more intentionally, especially once date filtering exists.

Acceptance criteria:

- Group or sort session-title hits and message hits consistently.
- Make result timestamps easier to interpret.
- Preserve performance for existing search usage.
- Keep the UI readable in narrow sidebars or compact layouts.

## 9. Create a contributor recognition workflow

- Type: enhancement
- Labels: `enhancement`, `help wanted`, `community`, `docs`

Contributors should get recognition somewhere more visible than the merged PR list. The repo now has a `CONTRIBUTORS.md` file, but the maintainer workflow for keeping it current should stay lightweight.

Acceptance criteria:

- Keep `CONTRIBUTORS.md` updated when first-time contributors land a PR.
- Use the PR template to collect preferred display name and public link.
- Document the recognition flow in `CONTRIBUTING.md`.
- Keep the contributor list easy to maintain by hand.

## 10. Add a "share debug info" path for bug reports

- Type: enhancement
- Labels: `enhancement`, `help wanted`, `bug`, `ux`

Bug reports are much easier to triage when users can attach useful logs and environment data. OAgent already has logs and environment-sensitive runtime pieces, but there is no guided export path for reporting problems.

Acceptance criteria:

- Add a lightweight way to collect relevant debug information for support issues.
- Exclude secrets and private workspace contents.
- Make the output easy to attach to a GitHub issue.
- Update the bug report guidance to mention the new flow if implemented.
