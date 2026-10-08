import { createServerFn } from "@tanstack/react-start";

import type { AppConfig, UserDoc } from "./types";

/** Verifies Telegram initData server-side, then issues a signed app session. */
export const telegramAuth = createServerFn({ method: "POST" })
  .inputValidator((input: { initData: string; startParam?: string | null; deviceId: string }) => ({
    initData: String(input?.initData ?? ""),
    startParam: input?.startParam ? String(input.startParam).slice(0, 64) : null,
    deviceId: String(input?.deviceId ?? "").slice(0, 128),
  }))
  .handler(async ({ data }) => {
    const { verifyInitData, sendPhoto, notifyAdmin } = await import("./server/telegram.server");
    const { getRequest } = await import("@tanstack/react-start/server");
    const { db } = await import("./server/db.server");
    const { issueSession } = await import("./server/session.server");
    const { USER_COLUMNS } = await import("./server/user.server");
    const { loadConfig } = await import("./server/config.server");
    const { getRequestHeader } = await import("@tanstack/react-start/server");

    const verified = await verifyInitData(data.initData);
    const client = db();
    const telegramId = String(verified.user.id);
    const startParam = data.startParam ?? verified.startParam;

    const ip =
      getRequestHeader("cf-connecting-ip") ??
      getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ??
      null;

    const existing = await client
      .from("users")
      .select(USER_COLUMNS)
      .eq("telegram_id", telegramId)
      .maybeSingle();

    let userId = existing.data?.id as string | undefined;
    let isNewUser = false;

    if (!userId) {
      isNewUser = true;
      // One account per device/IP: the first one keeps farming, later ones are suspended.
      const dupe = data.deviceId
        ? await client.from("users").select("id").eq("device_hash", data.deviceId).limit(1)
        : { data: [] as { id: string }[] };
      const duplicate = (dupe.data ?? []).length > 0;

      let referrerId: string | null = null;
      if (startParam && startParam !== telegramId) {
        const ref = await client
          .from("users")
          .select("id, suspended")
          .eq("telegram_id", startParam)
          .maybeSingle();
        if (ref.data && !ref.data.suspended) referrerId = ref.data.id as string;
      }

      const insert = await client
        .from("users")
        .insert({
          telegram_id: telegramId,
          username: verified.user.username,
          first_name: verified.user.firstName,
          last_name: verified.user.lastName,
          photo_url: verified.user.photoUrl,
          device_hash: data.deviceId || null,
          signup_ip: ip,
          // Second accounts on a device can still open and use the app (so testers and
          // moderators never hit a locked screen), but they earn no referral reward and
          // cannot withdraw — see requestWithdrawal.
          referred_by: duplicate ? null : referrerId,
          suspended: false,
          suspended_reason: duplicate
            ? "Duplicate device: referral rewards and withdrawals disabled."
            : null,
          is_admin: telegramId === process.env["BEARFARM_ADMIN_TELEGRAM_ID"],
        })
        .select("id")
        .single();
      if (insert.error) throw new Error("Could not create your farm. Please try again.");
      userId = insert.data.id as string;

      if (referrerId && !duplicate) {
        const config = await loadConfig();
        await client.from("referrals").insert({
          referrer_id: referrerId,
          referred_id: userId,
          stage: "pending",
          earned: config.referralJoinReward,
        });
        await client.rpc("bf_apply_amount", {
          p_user: referrerId,
          p_amount: 0,
          p_kind: "referral_pending",
          p_label: "New friend joined",
          p_meta: { referred: userId },
        });
        // Add (never overwrite) — earlier unclaimed referral rewards must stay.
        const { addReferralPot } = await import("./server/referral.server");
        await addReferralPot(referrerId, config.referralJoinReward);
      }

      {
        const name = (verified.user.firstName ?? "farmer").replace(/[<>&]/g, "").slice(0, 40);
        const origin = (() => {
          try {
            return new URL(getRequest().url).origin;
          } catch {
            return "https://bear-farm-earn.vercel.app";
          }
        })();
        void sendPhoto(
          telegramId,
          `${origin}/bear-farm-banner.png`,
          `🎉 <b>Welcome to the farm, ${name}!</b> 🐻🌾\n\n` +
            `Your Bear Farm account is ready.\n\n` +
            `⛏️ Start mining on the home screen\n` +
            `🎁 Claim your daily reward every day\n` +
            `✅ Finish tasks for instant tokens\n` +
            `👥 Invite friends and earn more\n` +
            `💸 Withdraw real USDT (BEP-20)\n\n` +
            `🍯 Happy farming!`,
        );
      }
      void notifyAdmin(
        `🆕 New farmer joined\n👤 ${verified.user.firstName ?? "Farmer"} (${telegramId})${duplicate ? "\n⚠️ Duplicate device — no referral reward, withdrawals blocked" : ""}`,
      );
    } else {
      await client
        .from("users")
        .update({
          username: verified.user.username,
          first_name: verified.user.firstName,
          last_name: verified.user.lastName,
          photo_url: verified.user.photoUrl,
          // Keeps the operator account marked as admin even if it signed up earlier.
          is_admin: telegramId === process.env["BEARFARM_ADMIN_TELEGRAM_ID"],
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
    }

    return { token: await issueSession(userId, telegramId), isNewUser };
  });

/** Public config + server clock. */
export const bootstrap = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string }) => ({ token: String(input?.token ?? "") }))
  .handler(async ({ data }): Promise<{ config: AppConfig; serverTime: number; user: UserDoc }> => {
    const { requireUser, toUserDoc } = await import("./server/user.server");
    const { loadConfig } = await import("./server/config.server");
    const { row } = await requireUser(data.token, { allowSuspended: true });
    return { config: await loadConfig(), serverTime: Date.now(), user: await toUserDoc(row) };
  });

/** Lightweight poll used instead of a realtime listener (keeps reads low). */
export const me = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string }) => ({ token: String(input?.token ?? "") }))
  .handler(async ({ data }): Promise<UserDoc> => {
    const { requireUser, toUserDoc } = await import("./server/user.server");
    const { row } = await requireUser(data.token, { allowSuspended: true });
    return toUserDoc(row);
  });
