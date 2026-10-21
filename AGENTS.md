<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Referral stage/reward and ranking rules live in the pure module src/lib/referral-rules.ts with vitest tests; referral pot changes go through addReferralPot (compare-and-swap) — prevents overwrites and keeps rules testable.
- Public Telegram identity lives in src/lib/bot-config.ts and overrides legacy stored bot settings; shared links prevent a bot-token change from leaving users on a retired bot.
