import { clsx } from "clsx";
import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className, ...rest }: { title?: ReactNode; actions?: ReactNode } & Omit<HTMLAttributes<HTMLElement>, "title">) {
  return (
    <section className={clsx("rounded-lg border border-line bg-surface shadow-xs", className)} {...rest}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums text-ink">{value}</dd>
      {hint && <dd className="mt-1 text-xs text-muted">{hint}</dd>}
    </div>
  );
}

const tones = {
  gray: "bg-gray-100 text-gray-700 ring-gray-200",
  green: "bg-green-50 text-green-800 ring-green-200",
  yellow: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-800 ring-red-200",
  blue: "bg-blue-50 text-blue-800 ring-blue-200",
  purple: "bg-purple-50 text-purple-800 ring-purple-200",
} as const;

export type Tone = keyof typeof tones;

export function Badge({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={clsx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", tones[tone])}>{children}</span>;
}

const STATUS_TONES: Record<string, Tone> = {
  PUBLISHED: "green",
  READY: "green",
  ACTIVE: "green",
  APPROVED: "green",
  VISIBLE: "green",
  SENT: "green",
  FULFILLED: "green",
  DRAFT: "gray",
  AWAITING_UPLOAD: "gray",
  CANCELED: "gray",
  COMPLETED: "blue",
  SCHEDULED: "blue",
  UPLOADED: "blue",
  PROCESSING: "yellow",
  SENDING: "yellow",
  PENDING: "yellow",
  PAUSED: "yellow",
  HIDDEN: "yellow",
  ARCHIVED: "purple",
  FAILED: "red",
  REJECTED: "red",
  SUSPENDED: "red",
  DELETED: "red",
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <Badge>none</Badge>;
  return <Badge tone={STATUS_TONES[status] ?? "gray"}>{status.replace(/_/g, " ").toLowerCase()}</Badge>;
}

export function Table({ children, caption, className }: { children: ReactNode; caption?: string; className?: string }) {
  return (
    <div className={clsx("overflow-x-auto rounded-lg border border-line bg-surface", className)}>
      <table className="min-w-full divide-y divide-line text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

export function Th({ className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope="col" className={clsx("whitespace-nowrap bg-subtle px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted", className)} {...rest} />;
}

export function Td({ className, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={clsx("px-3 py-2 align-top text-ink", className)} {...rest} />;
}

export function Tr({ className, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={clsx("border-t border-line first:border-t-0", className)} {...rest} />;
}

export function Callout({ tone = "blue", title, children }: { tone?: "blue" | "yellow" | "gray"; title?: ReactNode; children: ReactNode }) {
  const cls = tone === "yellow" ? "border-amber-200 bg-amber-50 text-amber-900" : tone === "gray" ? "border-line bg-subtle text-ink" : "border-blue-200 bg-blue-50 text-blue-900";
  return (
    <div className={clsx("rounded-md border px-4 py-3 text-sm", cls)}>
      {title && <p className="font-semibold">{title}</p>}
      <div className={clsx(title && "mt-1", "space-y-1")}>{children}</div>
    </div>
  );
}

export function DescriptionList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">{i.label}</dt>
          <dd className="mt-0.5 break-words text-sm text-ink">{i.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
