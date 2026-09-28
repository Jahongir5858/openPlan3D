# Unified Telegram Client

This branch builds a desktop Telegram client where two or more logged-in Telegram accounts are presented as one workspace.

Base project: guidegram/guidegram, pinned to commit 155b7c5dc2e77c219972ff01ffeb4ce15ae2d2e9.

## Unified behavior

- All chats from every connected account are merged into one chronological list.
- Personal chats, groups, supergroups, channels, bots, unread and archive filters operate over that merged list.
- Clicking a chat automatically routes through the account that owns it.
- Message cache keys use accountId + chatId so identical peer IDs in different accounts cannot collide.
- Realtime messages stay attached to their owner account.
- Sending text/media and normal chat actions use the owner account automatically.
- Mark-all-read can operate across all connected accounts.
- Clicking an account avatar still gives a single-account fallback view.
- Telegram server-side accounts remain separate; only the local desktop UI is unified.

## Security

No phone number, login code, 2FA password, API hash, or Telegram session is stored in this repository. Authentication remains in local desktop session storage.

This build focuses on normal multi-account aggregation and routing. It does not add stealth/read-receipt-evasion features.

## Build output

The GitHub Actions workflow checks out the pinned upstream client, applies the unified patch, runs the TypeScript/Vite build, then builds Windows x64. The result is uploaded as the artifact named Unified-Telegram-Windows-x64.