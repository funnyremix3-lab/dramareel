import { amountToMicros } from "./money";

/** One row of POST /admin/ads/network-reports/import (NetworkReportRowDto). */
export interface NetworkReportRow {
  date: string; // YYYY-MM-DD
  adUnitId: string;
  impressions: number;
  clicks: number;
  estimatedEarningsMicros: number;
  currency: string;
}

export interface ParseIssue {
  line: number;
  message: string;
}

export interface ParseResult {
  rows: NetworkReportRow[];
  errors: ParseIssue[];
}

/** RFC 4180 CSV → string cells. Handles quotes, escaped quotes, CRLF and a UTF-8 BOM. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      out.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    out.push(row);
  }
  return out.filter((r) => r.some((c) => c.trim() !== ""));
}

const norm = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9()]+/g, " ").trim();

type Column = "date" | "adUnitId" | "adUnitName" | "impressions" | "clicks" | "earnings" | "currency";

/** Accepts AdMob's export headers ("Date", "Ad unit ID", "Estimated earnings (USD)") and simple snake/camel names. */
function columnFor(header: string): Column | null {
  const h = norm(header);
  if (h === "date" || h === "day" || h === "report date") return "date";
  // norm() turns "ad_unit_id" and "Ad unit ID" into "ad unit id".
  if (h === "ad unit id" || h === "adunitid") return "adUnitId";
  // AdMob also exports the ad unit *name*; only used when there is no ID column.
  if (h === "ad unit") return "adUnitName";
  if (h.startsWith("impressions")) return "impressions";
  if (h.startsWith("clicks")) return "clicks";
  if (h.startsWith("estimated earnings") || h.startsWith("earnings") || h === "revenue") return "earnings";
  if (h === "currency" || h === "currency code") return "currency";
  return null;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function isoDate(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "2026-10-01", "20261001", "10/01/2026" (US, as AdMob exports) or "Oct 1, 2026" → "2026-10-01". */
export function parseReportDate(raw: string): string | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return isoDate(+m[1], +m[2], +m[3]);
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (m) return isoDate(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return isoDate(+m[3], +m[1], +m[2]);
  m = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s);
  if (m && MONTHS[m[1].toLowerCase()]) return isoDate(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
  return null;
}

function parseCount(raw: string): number | null {
  const s = raw.trim().replace(/,/g, "");
  if (s === "") return 0;
  return /^\d+$/.test(s) && Number.isSafeInteger(Number(s)) ? Number(s) : null;
}

/**
 * Parses a pasted AdMob network report into import rows.
 * The currency comes from a Currency column, else from the earnings header ("Estimated earnings (USD)"),
 * else from `defaultCurrency`.
 */
export function parseAdmobCsv(text: string, defaultCurrency = "USD"): ParseResult {
  const table = parseCsv(text);
  const errors: ParseIssue[] = [];
  if (table.length === 0) return { rows: [], errors: [{ line: 1, message: "The CSV is empty" }] };

  const header = table[0];
  const index: Partial<Record<Column, number>> = {};
  let headerCurrency: string | null = null;
  header.forEach((h, i) => {
    const col = columnFor(h);
    if (col && index[col] === undefined) index[col] = i;
    if (col === "earnings") {
      const cur = /\(([A-Za-z]{3})\)/.exec(h);
      if (cur) headerCurrency = cur[1].toUpperCase();
    }
  });
  if (index.adUnitId === undefined && index.adUnitName !== undefined) index.adUnitId = index.adUnitName;
  const missing = (["date", "adUnitId", "impressions", "clicks", "earnings"] as const).filter((c) => index[c] === undefined);
  if (missing.length) {
    return { rows: [], errors: [{ line: 1, message: `Missing column(s): ${missing.join(", ")}. Expected Date, Ad unit ID, Impressions, Clicks, Estimated earnings.` }] };
  }

  const rows: NetworkReportRow[] = [];
  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    const line = r + 1;
    const get = (c: Column) => (index[c] === undefined ? "" : (cells[index[c]!] ?? "").trim());
    // AdMob appends a "Total" row; skip it.
    if (/^total/i.test(get("date"))) continue;

    const date = parseReportDate(get("date"));
    const adUnitId = get("adUnitId");
    const impressions = parseCount(get("impressions"));
    const clicks = parseCount(get("clicks"));
    const earnings = get("earnings") === "" ? 0 : amountToMicros(get("earnings"));
    const currency = (get("currency") || headerCurrency || defaultCurrency).toUpperCase();

    const problems: string[] = [];
    if (!date) problems.push(`invalid date "${get("date")}"`);
    if (!adUnitId) problems.push("missing ad unit ID");
    else if (adUnitId.length > 120) problems.push("ad unit ID is longer than 120 characters");
    if (impressions === null) problems.push(`invalid impressions "${get("impressions")}"`);
    if (clicks === null) problems.push(`invalid clicks "${get("clicks")}"`);
    if (earnings === null) problems.push(`invalid earnings "${get("earnings")}"`);
    if (!/^[A-Z]{3}$/.test(currency)) problems.push(`invalid currency "${currency}"`);
    if (problems.length) {
      errors.push({ line, message: problems.join("; ") });
      continue;
    }
    rows.push({ date: date!, adUnitId, impressions: impressions!, clicks: clicks!, estimatedEarningsMicros: earnings!, currency });
  }
  if (rows.length > 5000) errors.push({ line: 0, message: "At most 5000 rows can be imported at once" });
  return { rows, errors };
}
