# Security policy

AutoMono stores tax and client data on the user's Mac, so security reports are taken seriously.

## Supported versions

Only the latest release receives fixes. Installed copies update themselves from
[GitHub Releases](https://github.com/aryan-curiel/automono/releases), so a fix ships as a new
release.

## Reporting a vulnerability

**Do not open a public issue.** Report it privately through GitHub:
[Security → Report a vulnerability](https://github.com/aryan-curiel/automono/security/advisories/new).

Please include:

- what an attacker can do and what they need first (local access, a crafted file, a malicious
  update server…);
- steps to reproduce, and the AutoMono and macOS versions;
- a suggested fix, if you have one.

You should get a reply within 7 days. Once a fix is released the advisory is published, with
credit to you unless you'd rather stay anonymous.

## Scope

In scope, for example:

- reading or writing files outside the app-data folder through a Tauri command;
- anything that lets a crafted receipt, contract, backup or bank CSV run code or corrupt data;
- weaknesses in the update flow (signature checks, `latest.json` handling);
- API keys leaking out of the macOS Keychain (logs, database, backups, crash output);
- data sent anywhere not listed in [PRIVACY.md](PRIVACY.md).

Out of scope:

- attacks that need an already-compromised macOS user account;
- the security of the AI providers themselves (Anthropic, OpenAI, OpenRouter);
- incorrect tax figures — please open a normal issue with the **Tax rule** template.

## How the app protects data

- No server, no account, no telemetry: there is nothing remote to breach.
- A strict Content Security Policy (`src-tauri/tauri.conf.json`) blocks remote scripts and network
  calls from the web view.
- Rust commands that open or delete stored files reject any path that resolves (after following
  `..` and symlinks) outside the app-data folder.
- AI provider keys live in the macOS Keychain, never in the database or backups.
- Releases are signed with a Developer ID, notarized by Apple, and update bundles are signed with
  a separate updater key that the app verifies before installing.
