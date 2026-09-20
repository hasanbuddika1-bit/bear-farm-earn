import { setGlobalOptions } from "firebase-functions/v2";

setGlobalOptions({ region: "us-central1", maxInstances: 40, memory: "256MiB" });

export { telegramAuth, bootstrap } from "./auth";
export { startMining, claimMining, miningWatcher } from "./mining";
export { claimDaily, claimRewardCode } from "./daily";
export { listTasks, startTaskSession, claimTask, claimDailyTask } from "./tasks";
export { listReferrals, claimReferralEarnings, adsReward } from "./referral";
export {
  setWallet,
  requestWithdrawal,
  listWithdrawals,
  listLedger,
  updatePreferences,
} from "./wallet";
export { publicLeaderboard, publicPayouts } from "./publicData";
export { adminLogin, adminList, adminAction, balanceAudit } from "./admin";
export { telegramWebhook } from "./bot";
