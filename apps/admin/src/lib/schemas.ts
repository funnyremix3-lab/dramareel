import { z } from "zod";
import { rupeesToPaise } from "./money";

/**
 * Form schemas. Form state is kept as strings/booleans (what inputs produce); each schema
 * validates with the same limits as the API DTOs and transforms into the request body.
 */

export type FieldErrors = Record<string, string>;

/** First message per field path ("cast.0.name" style keys). */
export function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export type ValidationResult<T> = { ok: true; data: T } | { ok: false; errors: FieldErrors };

export function validate<S extends z.ZodType>(schema: S, values: unknown): ValidationResult<z.output<S>> {
  const r = schema.safeParse(values);
  return r.success ? { ok: true, data: r.data } : { ok: false, errors: fieldErrors(r.error) };
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** "" → undefined, otherwise a whole number between min and max. */
const optionalInt = (min: number, max: number) =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || /^-?\d+$/.test(v), "Must be a whole number")
    .transform((v) => (v === "" ? undefined : Number(v)))
    .refine((v) => v === undefined || (v >= min && v <= max), `Must be between ${min} and ${max}`);

/** "" → null (clears the value), otherwise a whole number between min and max. */
const nullableInt = (min: number, max: number) => optionalInt(min, max).transform((v) => (v === undefined ? null : v));

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `At most ${max} characters`)
    .transform((v) => (v === "" ? undefined : v));

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

/** Comma/newline separated list → trimmed, de-duplicated array. */
export function splitList(input: string): string[] {
  return [...new Set(input.split(/[,\n]/).map((s) => s.trim()).filter(Boolean))];
}

// ───────── Dramas ─────────

export const dramaFormSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(160, "At most 160 characters"),
  slug: z.string().trim().min(1, "Slug is required").max(120, "At most 120 characters").regex(SLUG, "Lowercase letters, digits and single hyphens only"),
  synopsis: z.string().trim().max(4000, "At most 4000 characters"),
  primaryLanguageCode: z.string().regex(/^[a-z]{2}$/, "Choose a language"),
  categorySlugs: z.array(z.string()).max(10, "At most 10 categories"),
  cast: z
    .array(z.object({ name: z.string().trim().min(1, "Name is required").max(80, "At most 80 characters"), role: z.string().trim().max(80, "At most 80 characters") }))
    .max(30, "At most 30 cast members"),
  tags: z
    .string()
    .transform(splitList)
    .refine((t) => t.length <= 20, "At most 20 tags")
    .refine((t) => t.every((x) => x.length <= 40), "Each tag must be at most 40 characters"),
  orientation: z.enum(["PORTRAIT", "LANDSCAPE"]),
  maturityRating: z.string().trim().max(10, "At most 10 characters"),
  isFeatured: z.boolean(),
  trendingScore: z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d+(\.\d+)?$/.test(v) && Number(v) <= 1_000_000), "Must be a number between 0 and 1,000,000")
    .transform((v) => (v === "" ? 0 : Number(v))),
  freeEpisodeCount: optionalInt(0, 1000),
  defaultUnlockCoins: optionalInt(0, 10000),
});

export type DramaFormValues = z.input<typeof dramaFormSchema>;
export type DramaFormOutput = z.output<typeof dramaFormSchema>;

export const emptyDramaForm: DramaFormValues = {
  title: "",
  slug: "",
  synopsis: "",
  primaryLanguageCode: "hi",
  categorySlugs: [],
  cast: [],
  tags: "",
  orientation: "PORTRAIT",
  maturityRating: "",
  isFeatured: false,
  trendingScore: "0",
  freeEpisodeCount: "5",
  defaultUnlockCoins: "30",
};

/**
 * Request body for POST/PATCH /admin/dramas. Pricing fields are only sent when the user
 * may change them, because the API rejects any pricing field without monetization:write.
 */
export function dramaPayload(v: DramaFormOutput, canPrice: boolean) {
  return {
    title: v.title,
    slug: v.slug,
    synopsis: v.synopsis,
    primaryLanguageCode: v.primaryLanguageCode,
    categorySlugs: v.categorySlugs,
    cast: v.cast.map((c) => (c.role ? { name: c.name, role: c.role } : { name: c.name })),
    tags: v.tags,
    orientation: v.orientation,
    ...(v.maturityRating ? { maturityRating: v.maturityRating } : {}),
    isFeatured: v.isFeatured,
    trendingScore: v.trendingScore,
    ...(canPrice && v.freeEpisodeCount !== undefined ? { freeEpisodeCount: v.freeEpisodeCount } : {}),
    ...(canPrice && v.defaultUnlockCoins !== undefined ? { defaultUnlockCoins: v.defaultUnlockCoins } : {}),
  };
}

export const translationSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(160, "At most 160 characters"),
  synopsis: z.string().trim().max(4000, "At most 4000 characters"),
});

// ───────── Episodes ─────────

export const episodeFormSchema = z.object({
  number: optionalInt(1, 10000),
  title: z.string().trim().max(160, "At most 160 characters"),
  synopsis: z.string().trim().max(2000, "At most 2000 characters"),
  access: z.enum(["FREE", "PREMIUM", ""]),
  unlockCoins: nullableInt(0, 10000),
});

export type EpisodeFormValues = z.input<typeof episodeFormSchema>;

export function episodePayload(v: z.output<typeof episodeFormSchema>, canPrice: boolean, isCreate: boolean) {
  return {
    ...(isCreate && v.number !== undefined ? { number: v.number } : {}),
    title: v.title,
    synopsis: v.synopsis,
    ...(canPrice && v.access ? { access: v.access } : {}),
    ...(canPrice ? { unlockCoins: v.unlockCoins } : {}),
  };
}

// ───────── Taxonomy ─────────

export const categorySchema = z.object({
  slug: z.string().trim().min(1, "Slug is required").max(60, "At most 60 characters").regex(SLUG, "Lowercase letters, digits and single hyphens only"),
  nameEn: z.string().trim().min(1, "English name is required").max(80, "At most 80 characters"),
  nameHi: z.string().trim().max(80, "At most 80 characters"),
  sortOrder: optionalInt(0, 1000),
  isActive: z.boolean(),
});

export const languageSchema = z.object({
  code: z.string().trim().regex(/^[a-z]{2}$/, "Two lowercase letters, e.g. hi"),
  name: z.string().trim().min(1, "Name is required").max(40, "At most 40 characters"),
  nativeName: z.string().trim().min(1, "Native name is required").max(40, "At most 40 characters"),
  enabled: z.boolean(),
});

// ───────── Users & roles ─────────

export const walletAdjustSchema = z.object({
  amount: z
    .string()
    .trim()
    .regex(/^-?\d+$/, "Enter a whole number of coins (negative to debit)")
    .transform(Number)
    .refine((n) => n !== 0, "Amount cannot be 0")
    .refine((n) => n >= -100_000 && n <= 100_000, "Must be between -100,000 and 100,000"),
  note: z.string().trim().min(3, "Note must be at least 3 characters").max(280, "At most 280 characters"),
});

export const roleSchema = z.object({
  key: z.string().trim().regex(/^[A-Z][A-Z0-9_]{2,39}$/, "3–40 characters: uppercase letters, digits and _, starting with a letter"),
  name: z.string().trim().min(2, "At least 2 characters").max(80, "At most 80 characters"),
  permissions: z.array(z.string()).max(30, "At most 30 permissions").refine((p) => !p.includes("*"), "Only OWNER may hold *"),
});

// ───────── Ads ─────────

export const AD_UNIT_ID = /^ca-app-pub-\d{16}\/\d{10}$/;

export const adConfigSchema = z.object({
  platform: z.enum(["ANDROID", "IOS"]),
  source: z.enum(["ADMOB", "DIRECT"]),
  adUnitId: z
    .string()
    .trim()
    .refine((v) => v === "" || AD_UNIT_ID.test(v), "Ad unit ID must look like ca-app-pub-XXXXXXXXXXXXXXXX/NNNNNNNNNN")
    .transform((v) => (v === "" ? null : v)),
  minEpisodesBetween: nullableInt(2, 100),
  minSecondsBetween: nullableInt(0, 86_400),
  maxPerUserPerDay: nullableInt(0, 500),
  rewardCoins: nullableInt(1, 1000),
  hideForSubscribers: z.boolean(),
  isActive: z.boolean(),
});

export type AdConfigFormValues = z.input<typeof adConfigSchema>;

const rupees = (label: string, required: boolean) =>
  z
    .string()
    .trim()
    .refine((v) => (v === "" ? !required : rupeesToPaise(v) !== null), required ? `${label}: enter an amount in rupees (up to 2 decimals)` : `${label}: invalid amount`)
    .transform((v) => (v === "" ? null : rupeesToPaise(v)));

export const campaignFormSchema = z
  .object({
    name: z.string().trim().min(2, "At least 2 characters").max(120, "At most 120 characters"),
    advertiserName: z.string().trim().min(2, "At least 2 characters").max(120, "At most 120 characters"),
    advertiserContact: optionalText(200),
    startAt: z.string().min(1, "Start date is required"),
    endAt: z.string().min(1, "End date is required"),
    pricingModel: z.enum(["CPM", "CPC", "FLAT"]),
    rateRupees: rupees("Rate", true),
    totalBudgetRupees: rupees("Budget", false),
    dailyImpressionCap: nullableInt(1, 10_000_000),
    perUserDailyCap: nullableInt(1, 100),
    priority: optionalInt(0, 100),
    languages: z.array(z.enum(["en", "hi"])),
    platforms: z.array(z.enum(["ANDROID", "IOS"])),
    placementKeys: z.array(z.string()).min(1, "Choose at least one sponsored placement").max(10, "At most 10 placements"),
  })
  .refine((v) => !v.startAt || !v.endAt || new Date(v.endAt) > new Date(v.startAt), { message: "End must be after start", path: ["endAt"] })
  .refine((v) => v.rateRupees === null || v.rateRupees <= 1_000_000_000, { message: "Rate is too large", path: ["rateRupees"] });

export type CampaignFormValues = z.input<typeof campaignFormSchema>;

/** <input type="datetime-local"> value (local time) → ISO string. */
export function localToIso(local: string): string {
  return new Date(local).toISOString();
}

/** ISO string → <input type="datetime-local"> value in local time. */
export function isoToLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function campaignPayload(v: z.output<typeof campaignFormSchema>) {
  const targeting: { languages?: string[]; platforms?: string[] } = {};
  if (v.languages.length) targeting.languages = v.languages;
  if (v.platforms.length) targeting.platforms = v.platforms;
  return {
    name: v.name,
    advertiserName: v.advertiserName,
    ...(v.advertiserContact ? { advertiserContact: v.advertiserContact } : {}),
    startAt: localToIso(v.startAt),
    endAt: localToIso(v.endAt),
    pricingModel: v.pricingModel,
    ratePaise: v.rateRupees as number,
    totalBudgetPaise: v.totalBudgetRupees,
    dailyImpressionCap: v.dailyImpressionCap,
    perUserDailyCap: v.perUserDailyCap,
    ...(v.priority !== undefined ? { priority: v.priority } : {}),
    targeting,
    placementKeys: v.placementKeys,
  };
}

export const creativeSchema = z.object({
  headline: optionalText(90),
  ctaText: optionalText(30),
  destinationUrl: z
    .string()
    .trim()
    .max(2000, "At most 2000 characters")
    .refine((v) => {
      try {
        const u = new URL(v);
        return u.protocol === "https:" && u.hostname.includes(".");
      } catch {
        return false;
      }
    }, "Destination must be a full https:// URL"),
  label: z
    .string()
    .trim()
    .refine((v) => v === "" || (v.length >= 3 && v.length <= 30), "Label must be 3–30 characters")
    .transform((v) => (v === "" ? undefined : v)),
});

// ───────── Products ─────────

export const productSchema = z
  .object({
    sku: z.string().trim().regex(/^[a-z0-9_.]{2,100}$/, "2–100 characters: lowercase letters, digits, _ and ."),
    kind: z.enum(["COIN_PACK", "SUBSCRIPTION"]),
    title: z.string().trim().min(2, "At least 2 characters").max(80, "At most 80 characters"),
    coins: optionalInt(1, 1_000_000),
    bonusCoins: optionalInt(0, 1_000_000),
    periodDays: optionalInt(1, 366),
    adFree: z.boolean(),
    isActive: z.boolean(),
    sortOrder: optionalInt(0, 1000),
  })
  .refine((v) => v.kind !== "COIN_PACK" || v.coins !== undefined, { message: "Coin packs need coins", path: ["coins"] })
  .refine((v) => v.kind !== "SUBSCRIPTION" || v.periodDays !== undefined, { message: "Subscriptions need a period", path: ["periodDays"] });

// ───────── Notifications ─────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const notificationSchema = z
  .object({
    titleEn: z.string().trim().min(1, "English title is required").max(120, "At most 120 characters"),
    titleHi: z.string().trim().max(120, "At most 120 characters"),
    bodyEn: z.string().trim().min(1, "English body is required").max(120, "At most 120 characters"),
    bodyHi: z.string().trim().max(120, "At most 120 characters"),
    deepLink: z
      .string()
      .trim()
      .max(300, "At most 300 characters")
      .refine((v) => v === "" || /^reeldrama:\/\/[\w\-/?=&]*$/.test(v), "Deep link must start with reeldrama:// (letters, digits, - / ? = & only)"),
    audience: z.enum(["all", "languages", "userIds"]),
    languages: z.array(z.enum(["en", "hi"])),
    userIds: z.string().transform(splitList),
  })
  .refine((v) => v.audience !== "languages" || v.languages.length > 0, { message: "Choose at least one language", path: ["languages"] })
  .refine((v) => v.audience !== "userIds" || v.userIds.length > 0, { message: "Enter at least one user ID", path: ["userIds"] })
  .refine((v) => v.audience !== "userIds" || v.userIds.length <= 1000, { message: "At most 1000 user IDs", path: ["userIds"] })
  .refine((v) => v.audience !== "userIds" || v.userIds.every((id) => UUID.test(id)), { message: "Every user ID must be a UUID v4", path: ["userIds"] });

export function notificationPayload(v: z.output<typeof notificationSchema>) {
  return {
    title: v.titleHi ? { en: v.titleEn, hi: v.titleHi } : { en: v.titleEn },
    body: v.bodyHi ? { en: v.bodyEn, hi: v.bodyHi } : { en: v.bodyEn },
    ...(v.deepLink ? { deepLink: v.deepLink } : {}),
    audience: v.audience === "all" ? { all: true } : v.audience === "languages" ? { languages: v.languages } : { userIds: v.userIds },
  };
}
