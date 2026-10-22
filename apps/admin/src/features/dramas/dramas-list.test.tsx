import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockFetch, renderWithProviders } from "@/test/utils";
import type { DramaListItem, Paged } from "@/lib/types";
import { DramasList } from "./dramas-list";

const drama = (over: Partial<DramaListItem>): DramaListItem => ({
  id: "11111111-1111-4111-8111-111111111111",
  slug: "pyaar-ka-safar",
  title: "Pyaar ka Safar",
  status: "PUBLISHED",
  posterUrl: null,
  episodeCount: 12,
  publishedEpisodeCount: 10,
  viewCount: 125000,
  isFeatured: true,
  publishedAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-20T10:00:00.000Z",
  ...over,
});

const page = (items: DramaListItem[]): Paged<DramaListItem> => ({ items, total: items.length, page: 1, pageSize: 25 });

describe("DramasList", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders rows from the API", async () => {
    mockFetch([
      {
        match: (u) => u.pathname.endsWith("/admin/dramas"),
        body: page([drama({}), drama({ id: "22222222-2222-4222-8222-222222222222", title: "Dil Ki Baat", slug: "dil-ki-baat", status: "DRAFT", isFeatured: false })]),
      },
    ]);
    renderWithProviders(<DramasList />);

    const table = await screen.findByRole("table", { name: "Dramas" });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3); // header + 2
    expect(within(rows[1]).getByRole("link", { name: "Pyaar ka Safar" })).toHaveAttribute("href", "/dramas/11111111-1111-4111-8111-111111111111");
    expect(within(rows[1]).getByText("published")).toBeInTheDocument();
    expect(within(rows[1]).getByText("10/12")).toBeInTheDocument();
    expect(within(rows[1]).getByText("1,25,000")).toBeInTheDocument();
    expect(within(rows[2]).getByText("draft")).toBeInTheDocument();
    expect(screen.getByText("1–2 of 2")).toBeInTheDocument();
  });

  it("sends the status filter to the API", async () => {
    const fetchMock = mockFetch([{ match: (u) => u.pathname.endsWith("/admin/dramas"), body: page([]) }]);
    renderWithProviders(<DramasList />);
    await screen.findByText("No dramas yet");

    await userEvent.selectOptions(screen.getByLabelText("Status"), "ARCHIVED");
    await screen.findByText("No dramas match these filters");
    const lastUrl = new URL(String(fetchMock.mock.calls.at(-1)?.[0]));
    expect(lastUrl.searchParams.get("status")).toBe("ARCHIVED");
    expect(lastUrl.searchParams.get("page")).toBe("1");
  });

  it("shows the API error message", async () => {
    mockFetch([{ match: () => true, status: 403, body: { error: { code: "FORBIDDEN", message: "Missing permission dramas:read", requestId: "r1" } } }]);
    renderWithProviders(<DramasList />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Missing permission dramas:read");
  });

  it("hides New drama without dramas:write", async () => {
    mockFetch([{ match: () => true, body: page([]) }]);
    renderWithProviders(<DramasList />, { roles: ["SUPPORT_AGENT"] });
    await screen.findByText("No dramas yet");
    expect(screen.queryByRole("link", { name: "New drama" })).not.toBeInTheDocument();
  });
});
