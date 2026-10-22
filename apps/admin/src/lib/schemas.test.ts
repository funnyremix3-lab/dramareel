import { describe, expect, it } from "vitest";
import {
  adConfigSchema,
  campaignFormSchema,
  campaignPayload,
  creativeSchema,
  dramaFormSchema,
  dramaPayload,
  emptyDramaForm,
  notificationPayload,
  notificationSchema,
  slugify,
  validate,
  walletAdjustSchema,
} from "./schemas";

const campaign = {
  name: "Diwali promo",
  advertiserName: "Acme",
  advertiserContact: "",
  startAt: "2026-11-01T00:00",
  endAt: "2026-11-15T23:59",
  pricingModel: "CPM" as const,
  rateRupees: "150.50",
  totalBudgetRupees: "",
  dailyImpressionCap: "",
  perUserDailyCap: "3",
  priority: "5",
  languages: ["hi" as const],
  platforms: [],
  placementKeys: ["home_sponsored_card"],
};

describe("campaign form", () => {
  it("converts rupees to paise and builds the API body", () => {
    const r = validate(campaignFormSchema, campaign);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const body = campaignPayload(r.data);
    expect(body).toMatchObject({
      ratePaise: 15050,
      totalBudgetPaise: null,
      dailyImpressionCap: null,
      perUserDailyCap: 3,
      priority: 5,
      targeting: { languages: ["hi"] },
      placementKeys: ["home_sponsored_card"],
    });
    expect(body).not.toHaveProperty("advertiserContact");
    expect(new Date(body.endAt) > new Date(body.startAt)).toBe(true);
  });

  it("rejects bad money, dates and missing placements", () => {
    const r = validate(campaignFormSchema, { ...campaign, rateRupees: "12.345", endAt: "2026-10-01T00:00", placementKeys: [] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.rateRupees).toMatch(/rupees/);
    expect(r.errors.placementKeys).toBe("Choose at least one sponsored placement");
  });

  it("requires end after start", () => {
    const r = validate(campaignFormSchema, { ...campaign, endAt: "2026-10-01T00:00" });
    expect(r.ok ? null : r.errors.endAt).toBe("End must be after start");
  });
});

describe("drama form", () => {
  const valid = { ...emptyDramaForm, title: "Pyaar ka Safar", slug: "pyaar-ka-safar", tags: "romance, family, romance" };

  it("validates and de-duplicates tags", () => {
    const r = validate(dramaFormSchema, valid);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.tags).toEqual(["romance", "family"]);
  });

  it("rejects an invalid slug and empty title", () => {
    const r = validate(dramaFormSchema, { ...valid, title: "  ", slug: "Bad Slug" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.title).toBe("Title is required");
    expect(r.errors.slug).toMatch(/Lowercase/);
  });

  it("validates nested cast rows", () => {
    const r = validate(dramaFormSchema, { ...valid, cast: [{ name: "", role: "Lead" }] });
    expect(r.ok ? null : r.errors["cast.0.name"]).toBe("Name is required");
  });

  it("omits pricing fields without monetization:write", () => {
    const r = validate(dramaFormSchema, valid);
    if (!r.ok) throw new Error("expected valid");
    expect(dramaPayload(r.data, false)).not.toHaveProperty("freeEpisodeCount");
    expect(dramaPayload(r.data, false)).not.toHaveProperty("defaultUnlockCoins");
    expect(dramaPayload(r.data, true)).toMatchObject({ freeEpisodeCount: 5, defaultUnlockCoins: 30 });
  });

  it("slugifies titles", () => {
    expect(slugify("  Pyaar Ka Safar: Part 2! ")).toBe("pyaar-ka-safar-part-2");
  });
});

describe("AdMob configuration", () => {
  const base = { platform: "ANDROID" as const, source: "ADMOB" as const, adUnitId: "", minEpisodesBetween: "4", minSecondsBetween: "300", maxPerUserPerDay: "", rewardCoins: "", hideForSubscribers: true, isActive: true };

  it("accepts a well-formed ad unit ID", () => {
    const r = validate(adConfigSchema, { ...base, adUnitId: "ca-app-pub-3940256099942544/5224354917" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toMatchObject({ adUnitId: "ca-app-pub-3940256099942544/5224354917", minEpisodesBetween: 4, maxPerUserPerDay: null });
  });

  it("rejects malformed ad unit IDs and interstitials on every transition", () => {
    const r = validate(adConfigSchema, { ...base, adUnitId: "ca-app-pub-123/456", minEpisodesBetween: "1" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.adUnitId).toMatch(/ca-app-pub-XXXXXXXXXXXXXXXX\/NNNNNNNNNN/);
    expect(r.errors.minEpisodesBetween).toBe("Must be between 2 and 100");
  });
});

describe("other forms", () => {
  it("requires https destinations for creatives", () => {
    expect(validate(creativeSchema, { headline: "", ctaText: "", destinationUrl: "http://example.com", label: "" }).ok).toBe(false);
    const ok = validate(creativeSchema, { headline: " Hi ", ctaText: "", destinationUrl: "https://example.com/x", label: "" });
    expect(ok.ok && ok.data).toEqual({ headline: "Hi", ctaText: undefined, destinationUrl: "https://example.com/x", label: undefined });
  });

  it("validates wallet adjustments", () => {
    expect(validate(walletAdjustSchema, { amount: "0", note: "fix" }).ok).toBe(false);
    expect(validate(walletAdjustSchema, { amount: "-50", note: "ok" }).ok).toBe(false);
    const r = validate(walletAdjustSchema, { amount: "-50", note: "Refund for double charge" });
    expect(r.ok && r.data).toEqual({ amount: -50, note: "Refund for double charge" });
  });

  it("builds a notification for exactly one audience", () => {
    const base = { titleEn: "New episode", titleHi: "", bodyEn: "Watch now", bodyHi: "अभी देखें", deepLink: "reeldrama://drama/abc", audience: "languages" as const, languages: ["hi" as const], userIds: "" };
    const r = validate(notificationSchema, base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(notificationPayload(r.data)).toEqual({
        title: { en: "New episode" },
        body: { en: "Watch now", hi: "अभी देखें" },
        deepLink: "reeldrama://drama/abc",
        audience: { languages: ["hi"] },
      });
    }
    const bad = validate(notificationSchema, { ...base, audience: "userIds" as const, userIds: "not-a-uuid", deepLink: "https://x" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.errors.userIds).toMatch(/UUID/);
      expect(bad.errors.deepLink).toMatch(/reeldrama:\/\//);
    }
  });
});
