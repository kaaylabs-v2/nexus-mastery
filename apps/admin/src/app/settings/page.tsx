"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Building2, Shield, Save, Check } from "lucide-react";
import { adminApi, type Organization } from "@/lib/api-client";

type Tab = "general" | "sso";

export default function AdminSettingsPage() {
  const [org, setOrg] = useState<Organization | null>(null);
  const [tab, setTab] = useState<Tab>("general");
  const [name, setName] = useState("");
  const [brandColor, setBrandColor] = useState("#4D9E94");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    adminApi.getOrg().then((o) => {
      setOrg(o);
      setName(o.name);
      const branding = (o.settings as Record<string, Record<string, string>>)?.branding;
      if (branding?.primary_color) setBrandColor(branding.primary_color);
    }).catch(console.error);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await adminApi.updateSettings({ name, branding: { primary_color: brandColor } });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) { alert(String(err)); }
    setSaving(false);
  };

  const tabs: { key: Tab; label: string; icon: typeof Building2 }[] = [
    { key: "general", label: "General", icon: Building2 },
    { key: "sso", label: "Single Sign-On", icon: Shield },
  ];

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-xl font-display font-bold text-foreground tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage your organization and preferences</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-lg bg-muted/50 p-0.5 w-fit">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                tab === t.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}>
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </div>

        {/* General */}
        {tab === "general" && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

            {/* Organization */}
            <div className="rounded-xl border border-border bg-card p-6 space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Organization</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Basic details about your organization</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1.5">Organization Name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)}
                    className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1.5">Plan</label>
                  <div className="h-10 flex items-center">
                    <span className="rounded-full bg-primary/10 text-primary px-3 py-1 text-sm font-medium capitalize">
                      {org?.plan_tier || "—"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Branding */}
            <div className="rounded-xl border border-border bg-card p-6 space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Branding</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Customize how your platform looks to learners</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1.5">Logo</label>
                  <div className="flex items-center gap-4">
                    <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center text-muted-foreground text-xs font-medium">
                      Logo
                    </div>
                    <button className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors">
                      Upload
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1.5">Primary Color</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={brandColor}
                      onChange={(e) => setBrandColor(e.target.value)}
                      className="h-10 w-10 rounded-lg cursor-pointer border-0 bg-transparent"
                    />
                    <input
                      value={brandColor}
                      onChange={(e) => setBrandColor(e.target.value)}
                      className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none w-28 font-mono"
                    />
                    <div className="h-10 w-10 rounded-lg" style={{ backgroundColor: brandColor }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Save */}
            <div className="flex justify-end">
              <button onClick={handleSave} disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {saved ? <><Check className="h-4 w-4" /> Saved</> : <><Save className="h-4 w-4" /> {saving ? "Saving..." : "Save Changes"}</>}
              </button>
            </div>
          </motion.div>
        )}

        {/* SSO */}
        {tab === "sso" && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <div className="rounded-xl border border-border bg-card p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Single Sign-On (SSO)</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Allow users to log in with your identity provider</p>
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">Coming Soon</span>
                </div>
                <button disabled
                  className="relative h-6 w-11 rounded-full bg-muted opacity-50 cursor-not-allowed">
                  <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow translate-x-0.5" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-4 py-3">
                SSO integration with Okta, Azure AD, and Google Workspace is planned for a future release. Contact support for enterprise SSO setup.
              </p>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
