import { afterEach, describe, expect, it, vi } from "vitest";
import { mockFetch } from "@/test/utils";
import { ApiError, api, buildUrl, configureApiAuth, errorMessage, parseApiError } from "./api";

describe("parseApiError", () => {
  it("reads the API error envelope", () => {
    const e = parseApiError(409, { error: { code: "CONFLICT", message: "Publish at least one episode first", details: { a: 1 }, requestId: "req-1" } });
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 409, code: "CONFLICT", message: "Publish at least one episode first", details: { a: 1 }, requestId: "req-1" });
  });

  it("parses a JSON string body", () => {
    const e = parseApiError(403, JSON.stringify({ error: { code: "FORBIDDEN", message: "Missing permission", requestId: "r" } }));
    expect(e.code).toBe("FORBIDDEN");
    expect(e.message).toBe("Missing permission");
  });

  it("exposes class-validator field messages", () => {
    const e = parseApiError(400, { error: { code: "VALIDATION_FAILED", message: "Request validation failed", details: { fields: ["slug must match", "title should not be empty"] } } });
    expect(e.fieldMessages).toEqual(["slug must match", "title should not be empty"]);
    expect(errorMessage(e)).toBe("Request validation failed: slug must match; title should not be empty");
  });

  it("falls back for non-envelope bodies", () => {
    const html = parseApiError(502, "<html>Bad gateway</html>", "hdr-req");
    expect(html.code).toBe("INTERNAL");
    expect(html.message).toBe("<html>Bad gateway</html>");
    expect(html.requestId).toBe("hdr-req");
    const empty = parseApiError(404, "");
    expect(empty).toMatchObject({ code: "NOT_FOUND", message: "Request failed (404)" });
    const weird = parseApiError(401, { error: "nope" });
    expect(weird.code).toBe("UNAUTHENTICATED");
  });
});

describe("api client", () => {
  afterEach(() => {
    configureApiAuth({ getToken: () => null, onUnauthorized: () => {} });
    vi.unstubAllGlobals();
  });

  it("builds URLs and skips empty query values", () => {
    expect(buildUrl("/admin/dramas", { q: "", status: undefined, page: 2 }, "http://x/api/v1")).toBe("http://x/api/v1/admin/dramas?page=2");
  });

  it("sends the bearer token and JSON body", async () => {
    configureApiAuth({ getToken: () => "tok", onUnauthorized: () => {} });
    const fetchMock = mockFetch([{ match: (u) => u.pathname.endsWith("/admin/dramas"), body: { id: "d1" } }]);
    await expect(api.post("/admin/dramas", { title: "x" })).resolves.toEqual({ id: "d1" });
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(init?.body).toBe(JSON.stringify({ title: "x" }));
  });

  it("returns undefined for 204", async () => {
    mockFetch([{ match: () => true, status: 204 }]);
    await expect(api.delete("/admin/dramas/1")).resolves.toBeUndefined();
  });

  it("throws ApiError with the server message", async () => {
    mockFetch([{ match: () => true, status: 409, body: { error: { code: "CONFLICT", message: "Only empty, unpublished dramas can be deleted", requestId: "abc" } } }]);
    await expect(api.delete("/admin/dramas/1")).rejects.toMatchObject({ status: 409, code: "CONFLICT", message: "Only empty, unpublished dramas can be deleted", requestId: "abc" });
  });

  it("signs out on 401 when a token was sent", async () => {
    const onUnauthorized = vi.fn();
    configureApiAuth({ getToken: () => "expired", onUnauthorized });
    mockFetch([{ match: () => true, status: 401, body: { error: { code: "UNAUTHENTICATED", message: "Token expired" } } }]);
    await expect(api.get("/me")).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("turns network failures into a readable error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(api.get("/me")).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });
});
