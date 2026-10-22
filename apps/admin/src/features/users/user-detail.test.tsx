import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockFetch, renderWithProviders } from "@/test/utils";
import type { UserDetail as UserDetailT } from "@/lib/types";
import { UserDetail } from "./user-detail";

const USER_ID = "33333333-3333-4333-8333-333333333333";

const user: UserDetailT = {
  id: USER_ID,
  authProviderId: "dev-viewer",
  email: "viewer@dev.local",
  phone: null,
  status: "ACTIVE",
  locale: "hi",
  createdAt: "2026-10-01T00:00:00.000Z",
  lastSeenAt: "2026-10-22T00:00:00.000Z",
  deletionRequestedAt: null,
  profile: { displayName: "Asha" },
  balance: 120,
  roles: [],
  transactions: [{ id: "t1", type: "AD_REWARD", amount: 10, balanceAfter: 120, idempotencyKey: "reward:x", note: null, createdAt: "2026-10-21T00:00:00.000Z" }],
  unlocks: [],
  payments: [],
  subscriptions: [],
  commentCount: 2,
};

describe("UserDetail permissions", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("hides wallet adjustment and role assignment from support agents", async () => {
    mockFetch([{ match: (u) => u.pathname.endsWith(`/admin/users/${USER_ID}`), body: user }]);
    renderWithProviders(<UserDetail id={USER_ID} />, { roles: ["SUPPORT_AGENT"] });

    expect(await screen.findByRole("heading", { name: "Asha" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Suspend" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adjust wallet" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Assign roles" })).not.toBeInTheDocument();
  });

  it("lets an owner adjust the wallet", async () => {
    const fetchMock = mockFetch([
      { match: (u, init) => u.pathname.endsWith("/wallet-adjustments") && init?.method === "POST", body: { balance: 170, transactionId: "t2" } },
      { match: (u) => u.pathname.endsWith(`/admin/users/${USER_ID}`), body: user },
    ]);
    renderWithProviders(<UserDetail id={USER_ID} />, { roles: ["OWNER"] });

    await userEvent.click(await screen.findByRole("button", { name: "Adjust wallet" }));
    await userEvent.type(screen.getByLabelText(/Coins/), "50");
    await userEvent.type(screen.getByLabelText(/Reason/), "Goodwill credit");
    await userEvent.click(screen.getByRole("button", { name: "Post adjustment" }));

    expect(await screen.findByText("Wallet adjusted. New balance: 170 coins")).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/wallet-adjustments"));
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ amount: 50, note: "Goodwill credit" });
  });

  it("shows field errors without calling the API", async () => {
    const fetchMock = mockFetch([{ match: (u) => u.pathname.endsWith(`/admin/users/${USER_ID}`), body: user }]);
    renderWithProviders(<UserDetail id={USER_ID} />, { roles: ["OWNER"] });
    await userEvent.click(await screen.findByRole("button", { name: "Adjust wallet" }));
    await userEvent.click(screen.getByRole("button", { name: "Post adjustment" }));
    expect(screen.getByText(/Enter a whole number of coins/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Coins/)).toHaveAttribute("aria-invalid", "true");
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/wallet-adjustments"))).toBe(false);
  });
});
