"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, FormError, Input } from "@/components/ui/form";
import { Badge, Callout, Card, PageHeader, StatusBadge } from "@/components/ui/layout";
import { QueryState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { usePermission } from "@/lib/auth";
import { env } from "@/lib/env";
import { adConfigSchema, validate, type AdConfigFormValues, type FieldErrors } from "@/lib/schemas";
import type { AdConfiguration, AdFormat, AdPlacement, AdPlatform } from "@/lib/types";
import { AdsNav } from "./ads-nav";

export const ADMOB_FORMATS: AdFormat[] = ["REWARDED", "INTERSTITIAL", "NATIVE"];
const PLATFORMS: AdPlatform[] = ["ANDROID", "IOS"];

/** Google's public sample ad units (https://developers.google.com/admob/android/test-ads). Safe for development only. */
export const GOOGLE_TEST_AD_UNITS: Record<AdPlatform, Partial<Record<AdFormat, string>>> = {
  ANDROID: {
    REWARDED: "ca-app-pub-3940256099942544/5224354917",
    INTERSTITIAL: "ca-app-pub-3940256099942544/1033173712",
    NATIVE: "ca-app-pub-3940256099942544/2247696110",
  },
  IOS: {
    REWARDED: "ca-app-pub-3940256099942544/1712485313",
    INTERSTITIAL: "ca-app-pub-3940256099942544/4411468910",
    NATIVE: "ca-app-pub-3940256099942544/3986624511",
  },
};

/** One configuration per (placement, platform, source); the source follows the placement format. */
function findConfig(p: AdPlacement, platform: AdPlatform) {
  const source = ADMOB_FORMATS.includes(p.format) ? "ADMOB" : "DIRECT";
  return p.configurations.find((c) => c.platform === platform && c.source === source);
}

const isTestUnit = (id: string | null) => !!id && id.startsWith("ca-app-pub-3940256099942544/");
const str = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

function ConfigDialog({ placement, platform, config, onClose }: { placement: AdPlacement; platform: AdPlatform; config: AdConfiguration | undefined; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const isAdmob = ADMOB_FORMATS.includes(placement.format);
  const [v, setV] = useState<AdConfigFormValues>({
    platform,
    source: isAdmob ? "ADMOB" : "DIRECT",
    adUnitId: config?.adUnitId ?? "",
    minEpisodesBetween: str(config?.minEpisodesBetween ?? (placement.format === "INTERSTITIAL" ? 4 : null)),
    minSecondsBetween: str(config?.minSecondsBetween ?? (placement.format === "INTERSTITIAL" ? 300 : null)),
    maxPerUserPerDay: str(config?.maxPerUserPerDay),
    rewardCoins: str(config?.rewardCoins),
    hideForSubscribers: config?.hideForSubscribers ?? placement.format !== "REWARDED",
    isActive: config?.isActive ?? true,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof AdConfigFormValues>(k: K, val: AdConfigFormValues[K]) => setV((p) => ({ ...p, [k]: val }));
  const testUnit = GOOGLE_TEST_AD_UNITS[platform][placement.format];

  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = validate(adConfigSchema, v);
    if (!r.ok) return setErrors(r.errors);
    if (isAdmob && !r.data.adUnitId) return setErrors({ adUnitId: "AdMob placements need an ad unit ID" });
    setErrors({});
    setBusy(true);
    setFormError(null);
    try {
      const body = { ...r.data, ...(isAdmob ? {} : { adUnitId: null }), ...(placement.format === "REWARDED" ? {} : { rewardCoins: null }) };
      await api.put(`/admin/ads/placements/${placement.key}/configurations`, body);
      toast.success(`${placement.key} · ${platform} saved`);
      await qc.invalidateQueries({ queryKey: ["ad-placements"] });
      onClose();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`${placement.name} · ${platform}`} description={`${placement.format.toLowerCase()} · source ${v.source}`} wide>
      <form onSubmit={submit} noValidate className="space-y-4">
        <FormError message={formError} />
        {isAdmob && (
          <Field
            label="AdMob ad unit ID"
            required
            error={errors.adUnitId}
            hint={
              <>
                Format ca-app-pub-XXXXXXXXXXXXXXXX/NNNNNNNNNN.{" "}
                {testUnit && (
                  <button type="button" className="text-brand-700 underline" onClick={() => set("adUnitId", testUnit)}>
                    Use Google test unit
                  </button>
                )}
              </>
            }
          >
            <Input value={v.adUnitId} placeholder="ca-app-pub-1234567890123456/1234567890" className="font-mono" onChange={(e) => set("adUnitId", e.target.value)} />
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {placement.format === "INTERSTITIAL" && (
            <>
              <Field label="Min. episodes between" error={errors.minEpisodesBetween} hint="At least 2: never on every swipe.">
                <Input inputMode="numeric" value={v.minEpisodesBetween} onChange={(e) => set("minEpisodesBetween", e.target.value)} />
              </Field>
              <Field label="Min. seconds between" error={errors.minSecondsBetween}>
                <Input inputMode="numeric" value={v.minSecondsBetween} onChange={(e) => set("minSecondsBetween", e.target.value)} />
              </Field>
            </>
          )}
          <Field label="Max per user per day" error={errors.maxPerUserPerDay} hint="Empty means no daily cap.">
            <Input inputMode="numeric" value={v.maxPerUserPerDay} onChange={(e) => set("maxPerUserPerDay", e.target.value)} />
          </Field>
          {placement.format === "REWARDED" && (
            <Field label="Reward coins" error={errors.rewardCoins} hint="Coins granted after a verified (SSV) view, for coin rewards.">
              <Input inputMode="numeric" value={v.rewardCoins} onChange={(e) => set("rewardCoins", e.target.value)} />
            </Field>
          )}
        </div>
        <Checkbox label="Hide for ad-free subscribers" checked={v.hideForSubscribers} onCheckedChange={(x) => set("hideForSubscribers", x)} description="Rewarded ads are opt-in and usually stay visible." />
        <Checkbox label="Active" checked={v.isActive} onCheckedChange={(x) => set("isActive", x)} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}>
            Save configuration
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function usePlacements() {
  return useQuery({ queryKey: ["ad-placements"], queryFn: ({ signal }) => api.get<AdPlacement[]>("/admin/ads/placements", undefined, signal) });
}

export function PlacementsPage() {
  const canWrite = usePermission("ads:write");
  const query = usePlacements();
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<{ placement: AdPlacement; platform: AdPlatform } | null>(null);
  const ssvUrl = `${env.apiUrl.replace(/^http:\/\/localhost(:\d+)?/, "https://api.<your-domain>")}/ads/admob/ssv`;

  async function toggle(p: AdPlacement) {
    try {
      await api.patch(`/admin/ads/placements/${p.key}`, { isActive: !p.isActive });
      toast.success(`${p.key} ${p.isActive ? "disabled" : "enabled"}`);
      await qc.invalidateQueries({ queryKey: ["ad-placements"] });
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <>
      <PageHeader title="Ads" description="AdMob (Google network) and direct campaigns are separate systems; their revenue is never combined." />
      <AdsNav />
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Callout tone="yellow" title="Development uses Google test ad units">
          <p>
            Outside production, configure only Google&apos;s public test ad units (publisher <code>ca-app-pub-3940256099942544</code>). Real ad units in development risk an
            AdMob policy violation. Test units never send SSV callbacks; the dev API simulates them instead.
          </p>
        </Callout>
        <Callout title="Rewarded ads: server-side verification (SSV)">
          <p>On every rewarded ad unit in AdMob, enable server-side verification with this callback URL:</p>
          <p>
            <code className="break-all rounded bg-white/70 px-1">{ssvUrl}</code>
          </p>
          <p>
            Rewards are granted only after Google calls it with a valid signature, then set <code>ADMOB_SSV_ENABLED=true</code> on the API. The app&apos;s own
            &quot;reward earned&quot; event is never trusted.
          </p>
        </Callout>
      </div>
      <QueryState query={query} isEmpty={(d) => d.length === 0}>
        {(placements) => (
          <div className="grid gap-4 lg:grid-cols-2">
            {placements.map((p) => {
              const isAdmob = ADMOB_FORMATS.includes(p.format);
              return (
                <Card
                  key={p.id}
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      {p.name} <Badge tone={isAdmob ? "yellow" : "blue"}>{isAdmob ? "AdMob" : "Direct"}</Badge> <StatusBadge status={p.isActive ? "ACTIVE" : "PAUSED"} />
                    </span>
                  }
                  actions={
                    canWrite && (
                      <Button size="sm" onClick={() => toggle(p)}>
                        {p.isActive ? "Disable" : "Enable"}
                      </Button>
                    )
                  }
                >
                  <p className="font-mono text-xs text-muted">
                    {p.key} · {p.format.toLowerCase()}
                  </p>
                  {p.description && <p className="mt-1 text-sm text-muted">{p.description}</p>}
                  <div className="mt-3 space-y-2">
                    {PLATFORMS.map((platform) => {
                      const cfg = findConfig(p, platform);
                      return (
                        <div key={platform} className="flex flex-wrap items-start justify-between gap-2 rounded-md bg-subtle px-3 py-2 text-sm">
                          <div className="min-w-0">
                            <p className="font-medium">
                              {platform} {cfg && !cfg.isActive && <Badge>inactive</Badge>}
                              {cfg && isTestUnit(cfg.adUnitId) && <Badge tone="yellow">Google test unit</Badge>}
                            </p>
                            {cfg ? (
                              <p className="text-xs text-muted">
                                {cfg.adUnitId && <span className="break-all font-mono">{cfg.adUnitId} · </span>}
                                {cfg.minEpisodesBetween !== null && `every ≥${cfg.minEpisodesBetween} episodes · `}
                                {cfg.minSecondsBetween !== null && `≥${cfg.minSecondsBetween}s apart · `}
                                {cfg.maxPerUserPerDay !== null ? `${cfg.maxPerUserPerDay}/day` : "no daily cap"}
                                {cfg.rewardCoins !== null && ` · +${cfg.rewardCoins} coins`}
                                {cfg.hideForSubscribers && " · hidden for subscribers"}
                              </p>
                            ) : (
                              <p className="text-xs text-muted">Not configured</p>
                            )}
                          </div>
                          {canWrite && (
                            <Button size="sm" onClick={() => setEditing({ placement: p, platform })}>
                              {cfg ? "Edit" : "Configure"}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </QueryState>
      {editing && (
        <ConfigDialog
          placement={editing.placement}
          platform={editing.platform}
          config={findConfig(editing.placement, editing.platform)}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
