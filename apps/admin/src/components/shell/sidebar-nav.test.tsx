import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { permissionsForRoles } from "@/lib/permissions";
import { SidebarNav } from "./sidebar-nav";

const links = () => within(screen.getByRole("navigation", { name: "Main" })).getAllByRole("link").map((a) => a.textContent);

describe("SidebarNav", () => {
  it("only shows pages an ads manager can use and marks the current page", () => {
    render(<SidebarNav permissions={permissionsForRoles(["ADS_MANAGER"])} pathname="/ads/campaigns/123" />);
    expect(links()).toEqual(["Overview", "Ads", "Reports"]);
    expect(screen.getByRole("link", { name: "Ads" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
  });

  it("hides owner-only pages from a content manager", () => {
    render(<SidebarNav permissions={permissionsForRoles(["CONTENT_MANAGER"])} pathname="/dramas" />);
    expect(links()).not.toContain("Roles");
    expect(links()).not.toContain("Users");
    expect(links()).toContain("Dramas");
  });
});
