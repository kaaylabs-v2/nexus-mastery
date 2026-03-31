"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Building2, Shield, Key, Webhook, Save, Plus, Copy, RefreshCw, Trash2 } from "lucide-react";
import { adminApi, type Organization } from "@/lib/api-client";

type Tab = "general" | "sso" | "api" | "webhooks";

const mockApiKeys = [
  { id: "k1", name: "Production Key", prefix: "arena_live_", last4: "x9f2", created: "2025-01-15", lastUsed: "2 min ago" },
  { id: "k2", name: "Development Key", prefix: "arena_test_", last4: "m3k8", created: "2025-02-20", lastUsed: "3 hrs ago" },
];

const mockWebhooks = [
  { id: "w1", url: "https://hooks.acme.com/arena/events", events: ["session.completed", "user.enrolled"], lastTriggered: "12 min ago" },
  { id: "w2", url: "https://api.internal.io/webhooks/arena", events: ["category.updated"], lastTriggered: "2 days ago" },
];

export default function AdminSettingsPage() {
  const [org, setOrg] = useState<Organization | null>(null);
  const [tab, setTab] = useState<Tab>("general");
  const [name, setName] = useState("");
  const [brandColor, setBrandColor] = useState("#4D9E94");
  const [ssoEnabled, setSsoEnabled] = useState(false);
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
    { key: "sso", label: "SSO", icon: Shield },
    { key: "api", label: "API Keys", icon: Key },
    { key: "webhooks", label: "Webhooks", icon: Webhook },
  ];

  return (
    <div className="max-w-4xl mx-auto px-6 py-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-5">

        {/* Tabs */}
        <div className="flex gap-1 rounded-lg bg-muted/50 p-0.5 w-fit">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                tab === t.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}>
              <t.icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          ))}
        </div>

        {/* General */}
        {tab === "general" && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Organization</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Organization Name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)}
                    className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Plan</label>
                  <p className="h-9 flex items-center text-sm text-foreground capitalize">{org?.plan_tier || "—"}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Branding</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Logo</label>
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center text-muted-foreground text-xs">Logo</div>
                    <button className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent">Upload</button>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Primary Color</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className="h-9 w-9 rounded cursor-pointer border-0" />
                    <input value={brandColor} onChange={(e) => setBrandColor(e.target.value)}
                      className="h-9 rounded-md border border-border bg-background px-3 text-xs outline-none w-28" />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button onClick={handleSave} disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                <Save className="h-3.5 w-3.5" /> {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
              </button>
            </div>
          </motion.div>
        )}

        {/* SSO */}
        {tab === "sso" && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <div className="rounded-xl border border-border bg-card p-5 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-foreground">Single Sign-On (SSO)</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Allow users to log in with your identity provider</p>
                </div>
                <button onClick={() => setSsoEnabled(!ssoEnabled)}
                  className={`relative h-5 w-9 rounded-full transition-colors ${ssoEnabled ? "bg-primary" : "bg-muted"}`}>
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${ssoEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
                </button>
              </div>

              {ssoEnabled && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="space-y-4 border-t border-border pt-4">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Identity Provider</label>
                    <input defaultValue="Okta" className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm outline-none max-w-xs" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">SSO URL (SAML Endpoint)</label>
                    <input placeholder="https://your-idp.com/sso/saml" className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Certificate (X.509)</label>
                    <textarea className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-mono min-h-[80px] resize-none outline-none"
                      placeholder={"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"} />
                  </div>
                  <p className="text-xs text-muted-foreground italic">SSO backend integration coming in a future update.</p>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}

        {/* API Keys */}
        {tab === "api" && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{mockApiKeys.length} API keys</p>
              <button className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                <Plus className="h-3.5 w-3.5" /> Create Key
              </button>
            </div>
            {mockApiKeys.map((key) => (
              <div key={key.id} className="rounded-xl border border-border bg-card p-4 group">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-foreground">{key.name}</h4>
                    <div className="flex items-center gap-2 mt-1.5">
                      <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono text-muted-foreground">
                        {key.prefix}--------{key.last4}
                      </code>
                      <button className="p-1.5 rounded text-muted-foreground hover:text-foreground"><Copy className="h-3.5 w-3.5" /></button>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span>Created {key.created}</span>
                      <span>Last used {key.lastUsed}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="p-1.5 rounded-md text-muted-foreground hover:bg-muted"><RefreshCw className="h-3.5 w-3.5" /></button>
                    <button className="p-1.5 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              </div>
            ))}
          </motion.div>
        )}

        {/* Webhooks */}
        {tab === "webhooks" && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{mockWebhooks.length} webhooks</p>
              <button className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                <Plus className="h-3.5 w-3.5" /> Add Webhook
              </button>
            </div>
            {mockWebhooks.map((wh) => (
              <div key={wh.id} className="rounded-xl border border-border bg-card p-4 group">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <code className="text-xs text-foreground font-mono">{wh.url}</code>
                      <span className="text-xs font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">active</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {wh.events.map((e) => (
                        <span key={e} className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-mono">{e}</span>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">Last triggered {wh.lastTriggered}</p>
                  </div>
                  <button className="p-1.5 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
