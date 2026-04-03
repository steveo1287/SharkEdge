import { PreferencesPanel } from "@/components/settings/preferences-panel";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import { buildProductSetupState, buildDefaultNotificationPreferences, getCurrentUserProfile, getDefaultSubscriptionSummary } from "@/services/account/user-service";
import { getSubscriptionSummaryForCurrentUser } from "@/services/account/entitlements-service";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  try {
    const [profile, plan] = await Promise.all([
      getCurrentUserProfile(),
      getSubscriptionSummaryForCurrentUser()
    ]);

    return (
      <div className="grid gap-6">
        <Card className="overflow-hidden border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(168,85,247,0.16),_transparent_32%),linear-gradient(145deg,rgba(2,6,23,0.98),rgba(15,23,42,0.94))] p-0 shadow-[0_28px_90px_rgba(2,6,23,0.42)]">
          <div className="grid gap-5 px-6 py-6 md:px-8 lg:grid-cols-[minmax(0,1.15fr)_280px] lg:items-end">
            <div className="grid gap-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.32em] text-fuchsia-300/80">
                Preferences
              </div>
              <h1 className="max-w-3xl font-display text-3xl font-semibold tracking-tight text-white md:text-4xl">
                Product controls that actually do something.
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
                Plan boundaries, alert controls, and quiet hours stay tied to the real SharkEdge
                feature set instead of pretending unsupported delivery or billing states exist.
              </p>
            </div>
            <div className="grid gap-3 rounded-[28px] border border-white/10 bg-slate-950/55 p-4">
              <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Controls</div>
              <div className="grid gap-3 text-sm text-slate-300">
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-slate-950/70 px-4 py-3">
                  <span>Plan boundaries</span>
                  <span className="text-white">Live</span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-slate-950/70 px-4 py-3">
                  <span>Quiet hours</span>
                  <span className="text-white">Managed</span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-slate-950/70 px-4 py-3">
                  <span>Alert prefs</span>
                  <span className="text-white">Editable</span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <SectionTitle
          title="Preferences"
          description="Plan-aware boundaries, in-app alert preferences, and quiet-hour controls are real here. Unsupported delivery or billing states are not implied."
        />

        <PreferencesPanel
          setup={null}
          plan={plan}
          preferences={profile.preferences}
        />
      </div>
    );
  } catch (error) {
    return (
      <div className="grid gap-6">
        <Card className="overflow-hidden border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(168,85,247,0.16),_transparent_32%),linear-gradient(145deg,rgba(2,6,23,0.98),rgba(15,23,42,0.94))] p-0 shadow-[0_28px_90px_rgba(2,6,23,0.42)]">
          <div className="grid gap-5 px-6 py-6 md:px-8 lg:grid-cols-[minmax(0,1.15fr)_280px] lg:items-end">
            <div className="grid gap-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.32em] text-fuchsia-300/80">
                Preferences
              </div>
              <h1 className="max-w-3xl font-display text-3xl font-semibold tracking-tight text-white md:text-4xl">
                Product controls that actually do something.
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
                Even when account data is thin, this page stays honest about which controls are live
                and which states are still waiting on setup.
              </p>
            </div>
            <div className="grid gap-3 rounded-[28px] border border-white/10 bg-slate-950/55 p-4">
              <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Controls</div>
              <div className="grid gap-3 text-sm text-slate-300">
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-slate-950/70 px-4 py-3">
                  <span>Plan boundaries</span>
                  <span className="text-white">Safe fallback</span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-slate-950/70 px-4 py-3">
                  <span>Quiet hours</span>
                  <span className="text-white">Ready</span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-slate-950/70 px-4 py-3">
                  <span>Alert prefs</span>
                  <span className="text-white">Fallback</span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <SectionTitle
          title="Preferences"
          description="Plan-aware boundaries, in-app alert preferences, and quiet-hour controls are real here. Unsupported delivery or billing states are not implied."
        />

        <PreferencesPanel
          setup={buildProductSetupState("Preferences", error)}
          plan={getDefaultSubscriptionSummary()}
          preferences={buildDefaultNotificationPreferences()}
        />
      </div>
    );
  }
}
