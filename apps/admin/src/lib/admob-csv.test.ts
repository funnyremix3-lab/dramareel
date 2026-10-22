import { describe, expect, it } from "vitest";
import { parseAdmobCsv, parseCsv, parseReportDate } from "./admob-csv";

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, CRLF and a BOM", () => {
    const rows = parseCsv('﻿a,b\r\n"x, y","he said ""hi"""\r\n');
    expect(rows).toEqual([
      ["a", "b"],
      ["x, y", 'he said "hi"'],
    ]);
  });
  it("drops blank lines", () => {
    expect(parseCsv("a\n\n b \n")).toEqual([["a"], [" b "]]);
  });
});

describe("parseReportDate", () => {
  it("accepts the formats AdMob exports", () => {
    expect(parseReportDate("2026-10-01")).toBe("2026-10-01");
    expect(parseReportDate("20261001")).toBe("2026-10-01");
    expect(parseReportDate("10/01/2026")).toBe("2026-10-01");
    expect(parseReportDate("Oct 1, 2026")).toBe("2026-10-01");
  });
  it("rejects impossible dates", () => {
    expect(parseReportDate("2026-02-30")).toBeNull();
    expect(parseReportDate("yesterday")).toBeNull();
  });
});

describe("parseAdmobCsv", () => {
  it("parses an AdMob export with the currency in the earnings header", () => {
    const csv = [
      "Date,Ad unit,Ad unit ID,Impressions,Clicks,Estimated earnings (USD)",
      '2026-10-20,Rewarded unlock,ca-app-pub-1234567890123456/1234567890,"1,520",14,3.25',
      "2026-10-21,Rewarded unlock,ca-app-pub-1234567890123456/1234567890,980,7,1.104",
      "Total,,,2500,21,4.354",
    ].join("\n");
    const { rows, errors } = parseAdmobCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { date: "2026-10-20", adUnitId: "ca-app-pub-1234567890123456/1234567890", impressions: 1520, clicks: 14, estimatedEarningsMicros: 3_250_000, currency: "USD" },
      { date: "2026-10-21", adUnitId: "ca-app-pub-1234567890123456/1234567890", impressions: 980, clicks: 7, estimatedEarningsMicros: 1_104_000, currency: "USD" },
    ]);
  });

  it("prefers the ad unit ID column over the ad unit name", () => {
    const { rows } = parseAdmobCsv("Ad unit,Ad unit ID,Date,Impressions,Clicks,Estimated earnings (USD)\nMy unit,ca-app-pub-1/2,2026-10-20,1,0,0");
    expect(rows[0].adUnitId).toBe("ca-app-pub-1/2");
  });

  it("uses a Currency column, then the default currency", () => {
    const withColumn = parseAdmobCsv("date,ad_unit_id,impressions,clicks,earnings,currency\n2026-10-20,unit-a,10,1,0.5,inr");
    expect(withColumn.rows[0].currency).toBe("INR");
    const withDefault = parseAdmobCsv("Date,Ad unit ID,Impressions,Clicks,Estimated earnings\n2026-10-20,unit-a,10,1,0.5", "EUR");
    expect(withDefault.rows[0].currency).toBe("EUR");
  });

  it("reports missing columns", () => {
    const { rows, errors } = parseAdmobCsv("Date,Impressions\n2026-10-20,5");
    expect(rows).toEqual([]);
    expect(errors[0].message).toMatch(/Missing column\(s\): adUnitId, clicks, earnings/);
  });

  it("reports bad rows with their line numbers and keeps good ones", () => {
    const csv = "Date,Ad unit ID,Impressions,Clicks,Estimated earnings (USD)\n2026-13-01,u,1,0,0\n2026-10-02,u,1.5,0,0\n2026-10-03,u,4,1,0.1";
    const { rows, errors } = parseAdmobCsv(csv);
    expect(rows).toHaveLength(1);
    expect(errors).toEqual([
      { line: 2, message: 'invalid date "2026-13-01"' },
      { line: 3, message: 'invalid impressions "1.5"' },
    ]);
  });

  it("handles an empty paste", () => {
    expect(parseAdmobCsv("   ").errors[0].message).toBe("The CSV is empty");
  });
});
