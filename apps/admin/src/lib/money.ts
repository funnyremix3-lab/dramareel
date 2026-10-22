/**
 * Money helpers. The API stores direct-campaign amounts in paise (1 rupee = 100 paise)
 * and AdMob earnings in micros (1 unit = 1,000,000 micros). Conversions are done on
 * strings/integers so no floating-point rounding sneaks in.
 */

const RUPEE_PATTERN = /^(\d{1,12})(?:\.(\d{1,2}))?$/;

/** "1,250.5" → 125050. Returns null for anything that is not a non-negative amount with at most 2 decimals. */
export function rupeesToPaise(input: string | number): number | null {
  const raw = typeof input === "number" ? (Number.isFinite(input) ? input.toFixed(2) : "") : input;
  const s = raw.trim().replace(/,/g, "").replace(/^₹\s*/, "");
  const m = RUPEE_PATTERN.exec(s);
  if (!m) return null;
  const whole = Number(m[1]);
  const fraction = Number((m[2] ?? "").padEnd(2, "0"));
  const paise = whole * 100 + fraction;
  return Number.isSafeInteger(paise) ? paise : null;
}

/** 125050 → "1250.50" (plain, for form inputs). */
export function paiseToRupees(paise: number | bigint | string | null | undefined): string {
  if (paise === null || paise === undefined || paise === "") return "";
  const n = BigInt(typeof paise === "number" ? Math.trunc(paise) : paise);
  const negative = n < BigInt(0);
  const abs = negative ? -n : n;
  const hundred = BigInt(100);
  const rupees = abs / hundred;
  const rest = (abs % hundred).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${rupees.toString()}.${rest}`;
}

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });

/** 125050 → "₹1,250.50" for display. */
export function formatPaise(paise: number | null | undefined): string {
  if (paise === null || paise === undefined || !Number.isFinite(paise)) return "—";
  return inr.format(paise / 100);
}

/** AdMob earnings: micros → "$12.34" in the report currency. */
export function formatMicros(micros: number | null | undefined, currency = "USD"): string {
  if (micros === null || micros === undefined || !Number.isFinite(micros)) return "—";
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, minimumFractionDigits: 2 }).format(micros / 1_000_000);
  } catch {
    return `${(micros / 1_000_000).toFixed(2)} ${currency}`;
  }
}

/** Decimal currency string → integer micros ("12.345678" → 12345678). Returns null if invalid. */
export function amountToMicros(input: string): number | null {
  const s = input.trim().replace(/,/g, "").replace(/^[^\d.-]+/, "");
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return null;
  const fraction = (m[2] ?? "").slice(0, 6).padEnd(6, "0");
  // Round half-up on the 7th decimal.
  const roundUp = (m[2]?.[6] ?? "0") >= "5" ? 1 : 0;
  const micros = Number(m[1]) * 1_000_000 + Number(fraction) + roundUp;
  return Number.isSafeInteger(micros) ? micros : null;
}
