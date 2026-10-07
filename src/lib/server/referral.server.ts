import { db } from "./db.server";

/**
 * Adds to a referrer's unclaimed pot without overwriting concurrent changes
 * (compare-and-swap retry, since the pot can change between read and write).
 */
export async function addReferralPot(referrerId: string, amount: number): Promise<boolean> {
  if (!(amount > 0)) return false;
  const client = db();
  for (let attempt = 0; attempt < 6; attempt++) {
    const cur = await client.from("users").select("referral_pot").eq("id", referrerId).maybeSingle();
    if (!cur.data) return false;
    const old = Number(cur.data.referral_pot ?? 0);
    const res = await client
      .from("users")
      .update({ referral_pot: old + amount })
      .eq("id", referrerId)
      .eq("referral_pot", old)
      .select("id");
    if (res.data && res.data.length > 0) return true;
  }
  return false;
}
