# Bear Farm Admin Dashboard Plan

## Goal
Replace the current narrow admin screen with a polished, desktop-oriented operator dashboard that keeps the existing farm visual identity while making users, payouts, tasks, rewards, and system health easy to scan and manage.

## Layout and navigation
- Give `/admin` its own full-width application shell instead of the mini-app’s centered mobile frame and bottom navigation.
- Add a dark green left sidebar with the Bear Farm brand, operator identity, active navigation, lower Settings/Logs links, and a red Log out action.
- Use a pale cream main canvas with a sticky top bar containing the page title, live status, UTC time, search, notifications, and a warm gold account avatar.
- Support desktop, tablet, and mobile: collapse the sidebar behind a menu on smaller screens, stack dense panels, and keep tables horizontally usable without clipped text.
- Preserve the playful Bear Farm character through the existing rounded display type, subtle farm texture, gold/green/red accents, emojis, and compact illustrated empty/loading states.

## Overview dashboard
- Build the requested KPI row for total users, active today, tokens mined, pending withdrawals, and paid out, including comparison captions where historical data exists.
- Add a 7-day “Tokens mined vs withdrawn” Recharts line chart, range switcher, hover values, legend, and loading/empty/error states.
- Add Live Activity with concise event rows, status dots, UTC timestamps, and a See all action into Logs.
- Add System Health for Firestore, functions, bot, webhook, App Check, scheduler, and security checks, based on real backend health data rather than decorative statuses.
- Add Quick Actions for task creation, maintenance mode, announcement sending, database backup, and all settings.

## Users workspace
- Add searchable, paginated user management with filters for active, suspended, duplicate-risk, and recent users.
- Show Telegram identity, balance, referrals, ad progress, wallet state, last active time, and account status.
- Provide working suspend/unsuspend, balance adjustment, and user-detail actions with confirmation dialogs and audit entries.
- Replace browser prompts with validated dialogs and clear success/error feedback.

## Withdrawals workspace
- Add status filters and a dense request table showing user, token amount, fee, net USDT, address, request time, and status.
- Provide approve and reject dialogs; approval requires a transaction hash, rejection requires a reason.
- Keep settlement atomic, update the ledger and aggregate totals, notify the user, post approved payments, and record every action in the audit log.

## Tasks and rewards workspace
- Build task creation/editing for Main and Partner tasks with Telegram channel, mini-app, and link verification types.
- Add enable/disable and delete controls with confirmations, preserving server-side verification requirements.
- Build reward-code creation with reward, maximum uses, optional expiry, live usage, active/disabled state, and disable action.
- Fix the current frontend/server action-name and payload mismatches so every existing control reaches the intended secure backend action.

## Settings and operations
- Add editable mining controls, including the default 100-token hourly cycle, daily rewards, referral stages, withdrawal thresholds/fees, channel links, and maintenance mode.
- Add announcement delivery with audience selection, preview, confirmation, batched Telegram sending, delivery counts, and audit records.
- Add a server-side backup action with progress/result reporting; if the Firebase project lacks export billing or storage permissions, show that exact configuration limitation instead of reporting a false success.
- Add operator logout that invalidates the admin session immediately.

## Analytics and activity data
- Add server-maintained daily aggregates for registrations, active users, mined tokens, withdrawals, payouts, and other dashboard totals so the overview never scans full collections.
- Record compact activity events for important user and admin actions, paginate them, and retain only the required operational window.
- Add a small health/status document updated by scheduled jobs and webhook activity for inexpensive dashboard reads.
- Make range filtering and “See all” requests bounded and paginated.

## Security and correctness
- Keep the existing Telegram identity requirement, App Check enforcement, server-only balance writes, append-only ledger, idempotency, and deny-by-default database rules.
- Require a valid short-lived admin session for every admin read and mutation, including analytics, announcements, backup, and logout.
- Validate every form and action server-side, use deterministic identifiers where needed, prevent duplicate processing, and avoid exposing Telegram IDs outside the admin area.
- Correct current identifier mismatches in user, withdrawal, task, reward-code, and configuration actions.
- Add focused tests for permissions, action payloads, withdrawal transitions, maintenance updates, aggregate updates, logout, and announcement/backup authorization.

## Technical implementation
- Refactor `src/routes/admin.tsx` into focused dashboard sections/components while retaining the `/admin` route and existing login gate.
- Update the root shell so the admin route is not constrained by the mini-app width or user bottom navigation.
- Extend the existing typed Firebase callable API and shared types for overview analytics, activity, health, announcements, backup status, session logout, and paginated resources.
- Extend the current admin Cloud Functions rather than adding client-side database access; use Recharts already present in the project.
- Add semantic dashboard tokens and subtle texture utilities to the global design system without replacing the user-facing farm theme.
- Update required Firestore indexes/rules only for the new server-managed aggregates and activity data; clients remain unable to write admin or money data.

## Verification
- Run frontend and function typechecks plus the focused backend test suite.
- Verify login, navigation, filters, dialogs, task/code creation, config edits, maintenance mode, withdrawals, logout, empty/loading/error states, and unauthorized access.
- Check the rendered dashboard at desktop, tablet, and mobile sizes, including sidebar collapse, table overflow, chart sizing, text fit, and absence of the mini-app bottom navigation.
- Confirm the latest preview build has no errors before completion.
