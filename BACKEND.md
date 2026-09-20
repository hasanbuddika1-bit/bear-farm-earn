# Bear Farm backend (zero-trust)

All money logic lives in Cloud Functions (`functions/src`). The client can never
write a balance: Firestore rules deny every client write, and the browser only
reads its own profile and its own append-only ledger.

## Security model

| Risk | Control |
| --- | --- |
| Fake Telegram user | `verifyInitData` HMAC check with the bot token, max 15 min age, before any custom token is minted |
| Client-edited balance | Rules deny all writes; `award`/`debit` in `lib/ledger.ts` are the only writers, inside transactions |
| Replayed reward calls | Idempotency doc per `uid + key` written in the same transaction |
| Fake ad views | Reward only from the signed provider callback (`adsReward`), deduped by impression id |
| Fake channel joins | `getChatMember` is checked server side for every channel task |
| Timer-skipped link tasks | Server-created task session with a stored start time |
| Multi-account farming | Device id + IP index; only the first account stays active, the rest are auto-suspended |
| Self referral / loops | Inviter id compared to invitee id; suspended invitees are marked `fake` |
| Shared USDT address | `wallets/{address}` uniqueness index |
| Withdrawal manipulation | Balance held atomically at request time; only an admin approves/rejects, refund is transactional |
| Brute force | `rateLimit` fixed windows per user per action |
| Admin impersonation | Admin Telegram id + username/password secrets + 2 hour server session + audit log |
| Tampered data | Hourly `balanceAudit` recomputes the ledger and auto-suspends mismatches with an admin alert |
| Bot spoofing | Telegram webhook secret-token header required |

App Check is enforced on every callable (set `ENFORCE_APP_CHECK=false` only for the emulator).

## Secrets (never in code)

```bash
firebase functions:secrets:set TELEGRAM_BOT_TOKEN
firebase functions:secrets:set TELEGRAM_WEBHOOK_SECRET
firebase functions:secrets:set ADMIN_USERNAME
firebase functions:secrets:set ADMIN_PASSWORD
firebase functions:secrets:set ADS_CALLBACK_SECRET
```

## Deploy

```bash
cd functions && npm install && npm run build && npm test
firebase deploy --only firestore:rules,firestore:indexes,functions
```

Then point the bot webhook at the deployed function:

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<telegramWebhook-url>&secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

Ad provider postback URL: `<adsReward-url>?userid={telegram_id}&impression_id={id}&sig=<hmac-sha256("<userid>:<impression_id>", ADS_CALLBACK_SECRET)>`
