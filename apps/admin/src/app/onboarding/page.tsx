"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function OnboardingPage() {
  const router = useRouter();
  const [orgName, setOrgName] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // Get user info from Auth0 session
      let email = "";
      let sub = "";
      try {
        const tokenRes = await fetch("/api/auth/token");
        if (tokenRes.ok) {
          const { accessToken } = await tokenRes.json();
          // Decode JWT payload (base64)
          const payload = JSON.parse(atob(accessToken.split(".")[1]));
          email = payload.email || payload[Object.keys(payload).find(k => k.includes("email")) || ""] || "";
          sub = payload.sub || "";
        }
      } catch {
        // If we can't get the token, the user needs to provide email
      }

      const res = await fetch(`${API_BASE}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_name: orgName,
          admin_name: fullName,
          admin_email: email || `${fullName.toLowerCase().replace(/\s/g, ".")}@example.com`,
          auth0_sub: sub || `auth0|manual-${Date.now()}`,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.detail || "Signup failed");
        return;
      }

      router.push("/");
    } catch (err) {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "hsl(40, 20%, 98%)", color: "hsl(220, 15%, 12%)" }}>
      <div className="w-full max-w-md p-8">
        <div className="flex items-center gap-2 mb-8">
          <div className="h-8 w-8 rounded-lg flex items-center justify-center text-sm font-bold text-white" style={{ background: "hsl(174, 42%, 40%)" }}>N</div>
          <span className="text-lg font-semibold">Nexus²</span>
        </div>
        <h1 className="text-xl font-semibold mb-2">Welcome to Nexus²</h1>
        <p className="text-sm mb-6" style={{ color: "hsl(220, 10%, 45%)" }}>Let&apos;s set up your organization.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium">Organization name</label>
            <input
              type="text" required value={orgName} onChange={(e) => setOrgName(e.target.value)}
              placeholder="Acme Corp"
              className="w-full mt-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
              style={{ borderColor: "hsl(220, 13%, 89%)", background: "white" }}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Your name</label>
            <input
              type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Smith"
              className="w-full mt-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
              style={{ borderColor: "hsl(220, 13%, 89%)", background: "white" }}
            />
          </div>
          {error && <p className="text-sm" style={{ color: "hsl(0, 72%, 51%)" }}>{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            style={{ background: "hsl(174, 42%, 40%)" }}>
            {loading ? "Creating..." : "Create Organization"}
          </button>
        </form>
      </div>
    </div>
  );
}
