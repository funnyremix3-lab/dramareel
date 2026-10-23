import { describe, expect, it } from "vitest";
import { NAV_ITEMS, hasAllPermissions, hasPermission, homePath, permissionsForRoles, visibleNav } from "./permissions";

describe("hasPermission (same rule as the API)", () => {
  it("matches the * grant", () => {
    expect(hasPermission(["*"], "wallet:adjust")).toBe(true);
  });
  it("matches exactly", () => {
    expect(hasPermission(["users:read"], "users:read")).toBe(true);
    expect(hasPermission(["users:read"], "users:suspend")).toBe(false);
  });
  it("matches prefix wildcards only on a full segment", () => {
    expect(hasPermission(["dramas:*"], "dramas:publish")).toBe(true);
    expect(hasPermission(["ads:*"], "ads:campaigns:write")).toBe(true);
    expect(hasPermission(["ads:*"], "adsx:read")).toBe(false);
    expect(hasPermission(["dramas:*"], "media:write")).toBe(false);
  });
  it("denies with no grants", () => {
    expect(hasPermission([], "dramas:read")).toBe(false);
    expect(hasAllPermissions(["dramas:read"], ["dramas:read", "dramas:write"])).toBe(false);
  });
});

describe("permissionsForRoles", () => {
  it("derives permissions from system roles and ignores unknown roles", () => {
    expect(permissionsForRoles(["OWNER"])).toEqual(["*"]);
    expect(permissionsForRoles(["ADS_MANAGER"]).sort()).toEqual(["ads:*", "analytics:read"]);
    expect(permissionsForRoles(["REGIONAL_EDITOR"])).toEqual([]);
    expect(permissionsForRoles([])).toEqual([]);
  });
  it("merges several roles without duplicates", () => {
    const p = permissionsForRoles(["ADS_MANAGER", "CONTENT_MANAGER"]);
    expect(p.filter((x) => x === "analytics:read")).toHaveLength(1);
    expect(hasPermission(p, "ads:write")).toBe(true);
    expect(hasPermission(p, "dramas:publish")).toBe(true);
  });
});

describe("nav gating", () => {
  const labels = (roles: string[]) => visibleNav(permissionsForRoles(roles)).map((i) => i.label);

  it("shows everything to an owner", () => {
    expect(labels(["OWNER"])).toEqual(NAV_ITEMS.map((i) => i.label));
  });
  it("shows content pages to a content manager, but not users, roles, ads or audit", () => {
    const l = labels(["CONTENT_MANAGER"]);
    expect(l).toEqual(["Overview", "Dramas", "Video processing", "Import videos", "Categories & languages", "Moderation", "Products", "Notifications", "Reports"]);
  });
  it("shows ads and analytics to an ads manager", () => {
    expect(labels(["ADS_MANAGER"])).toEqual(["Overview", "Ads", "Reports"]);
  });
  it("shows users, moderation and audit to support", () => {
    expect(labels(["SUPPORT_AGENT"])).toEqual(["Users", "Moderation", "Audit log"]);
  });
  it("gives viewers and unknown roles no admin pages", () => {
    expect(labels([])).toEqual([]);
    expect(homePath(permissionsForRoles(["SOMETHING_CUSTOM"]))).toBeNull();
  });
  it("sends each role to its first page", () => {
    expect(homePath(permissionsForRoles(["SUPPORT_AGENT"]))).toBe("/users");
    expect(homePath(permissionsForRoles(["OWNER"]))).toBe("/overview");
  });
});
