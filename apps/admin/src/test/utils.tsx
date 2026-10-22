import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { PermissionsProvider } from "@/lib/auth";
import { permissionsForRoles } from "@/lib/permissions";

/** Renders inside the same providers the app shell uses, with UI permissions for the given roles. */
export function renderWithProviders(ui: ReactElement, { roles = ["OWNER"] }: { roles?: string[] } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <PermissionsProvider permissions={permissionsForRoles(roles)}>{ui}</PermissionsProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

interface Route {
  match: (url: URL, init?: RequestInit) => boolean;
  status?: number;
  body?: unknown;
}

/** Stubs global fetch with a list of routes; unmatched requests get a 404 in the API error shape. */
export function mockFetch(routes: Route[]) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const route = routes.find((r) => r.match(url, init));
    if (!route) {
      return new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: `No mock for ${url.pathname}`, requestId: "test" } }), { status: 404 });
    }
    const status = route.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(route.body), { status, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}
