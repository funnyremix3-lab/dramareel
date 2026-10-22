import { describe, expect, it } from "vitest";
import { amountToMicros, formatPaise, paiseToRupees, rupeesToPaise } from "./money";

describe("rupeesToPaise", () => {
  it("converts whole and decimal rupees exactly", () => {
    expect(rupeesToPaise("150")).toBe(15000);
    expect(rupeesToPaise("150.5")).toBe(15050);
    expect(rupeesToPaise("150.05")).toBe(15005);
    expect(rupeesToPaise("0.1")).toBe(10);
    expect(rupeesToPaise("0")).toBe(0);
  });
  it("avoids floating point errors", () => {
    // 0.29 * 100 === 28.999999999999996 in floating point
    expect(rupeesToPaise("0.29")).toBe(29);
    expect(rupeesToPaise("1.15")).toBe(115);
    expect(rupeesToPaise(19.99)).toBe(1999);
  });
  it("accepts thousands separators and a rupee sign", () => {
    expect(rupeesToPaise("1,25,000.50")).toBe(12500050);
    expect(rupeesToPaise("₹ 99")).toBe(9900);
  });
  it("rejects invalid input", () => {
    expect(rupeesToPaise("")).toBeNull();
    expect(rupeesToPaise("abc")).toBeNull();
    expect(rupeesToPaise("-5")).toBeNull();
    expect(rupeesToPaise("1.234")).toBeNull();
    expect(rupeesToPaise("1e5")).toBeNull();
  });
});

describe("paiseToRupees", () => {
  it("formats paise as a plain rupee string", () => {
    expect(paiseToRupees(15005)).toBe("150.05");
    expect(paiseToRupees(10)).toBe("0.10");
    expect(paiseToRupees(0)).toBe("0.00");
    expect(paiseToRupees(null)).toBe("");
    expect(paiseToRupees(-250)).toBe("-2.50");
  });
  it("round-trips with rupeesToPaise", () => {
    for (const p of [0, 1, 99, 100, 12345, 987654321]) {
      expect(rupeesToPaise(paiseToRupees(p))).toBe(p);
    }
  });
});

describe("display helpers", () => {
  it("formats paise as INR", () => {
    expect(formatPaise(12500050)).toBe("₹1,25,000.50");
    expect(formatPaise(null)).toBe("—");
  });
  it("converts currency amounts to micros", () => {
    expect(amountToMicros("3.25")).toBe(3_250_000);
    expect(amountToMicros("0.0000015")).toBe(2);
    expect(amountToMicros("1,234.5")).toBe(1_234_500_000);
    expect(amountToMicros("x")).toBeNull();
  });
});
