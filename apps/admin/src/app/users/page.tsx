"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UserPlus, Upload, Search, X, Users, ChevronRight } from "lucide-react";
import Link from "next/link";
import { adminApi, type AdminUser } from "@/lib/api-client";

type RoleFilter = "all" | "learner" | "facilitator" | "org_admin";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("learner");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    adminApi.listUsers().then(setUsers).catch(console.error).finally(() => setLoading(false));
  }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      await adminApi.inviteUser({ email: inviteEmail, role: inviteRole });
      setShowInvite(false);
      setInviteEmail("");
      const updated = await adminApi.listUsers();
      setUsers(updated);
    } catch (err) {
      alert(String(err));
    }
    setSending(false);
  };

  const handleCSVImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await adminApi.bulkImport(file);
      alert(`Imported: ${result.valid_count} valid, ${result.errors.length} errors`);
      const updated = await adminApi.listUsers();
      setUsers(updated);
    } catch (err) {
      alert(String(err));
    }
  }, []);

  // Filter out e2e/test users and apply search + role filter
  const filtered = useMemo(() => {
    return users
      .filter((u) => {
        // Hide obvious test/e2e users
        const isTestUser = u.email.includes("e2e-") || u.email.includes("test-") || u.display_name?.toLowerCase().includes("e2e");
        if (isTestUser) return false;
        if (roleFilter !== "all" && u.role !== roleFilter) return false;
        if (search) {
          const q = search.toLowerCase();
          return u.email.toLowerCase().includes(q) || (u.display_name || "").toLowerCase().includes(q);
        }
        return true;
      });
  }, [users, search, roleFilter]);

  const roleCounts = useMemo(() => {
    const real = users.filter((u) => !u.email.includes("e2e-") && !u.email.includes("test-"));
    return {
      all: real.length,
      learner: real.filter((u) => u.role === "learner").length,
      facilitator: real.filter((u) => u.role === "facilitator").length,
      org_admin: real.filter((u) => u.role === "org_admin").length,
    };
  }, [users]);

  const roleLabel: Record<string, string> = {
    org_admin: "Admin",
    facilitator: "Facilitator",
    learner: "Learner",
  };

  const roleBadge: Record<string, string> = {
    org_admin: "bg-purple-50 text-purple-600",
    facilitator: "bg-blue-50 text-blue-600",
    learner: "bg-gray-100 text-gray-600",
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="space-y-3 mt-6">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-display font-bold text-foreground tracking-tight">Learners</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{roleCounts.all} members in your organization</p>
          </div>
          <div className="flex gap-2">
            <label className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-foreground hover:bg-accent cursor-pointer transition-colors">
              <Upload className="h-4 w-4" /> Import CSV
              <input type="file" accept=".csv" onChange={handleCSVImport} className="hidden" />
            </label>
            <button
              onClick={() => setShowInvite(!showInvite)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <UserPlus className="h-4 w-4" /> Invite
            </button>
          </div>
        </div>

        {/* Invite form */}
        <AnimatePresence>
          {showInvite && (
            <motion.form
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              onSubmit={handleInvite}
              className="rounded-xl border border-primary/20 bg-primary/5 p-5 overflow-hidden"
            >
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-foreground mb-1.5">Email address</label>
                  <input
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    type="email"
                    required
                    placeholder="name@company.com"
                    className="w-full h-10 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="w-40">
                  <label className="block text-xs font-medium text-foreground mb-1.5">Role</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="w-full h-10 rounded-lg border border-border bg-card px-3 text-sm outline-none"
                  >
                    <option value="learner">Learner</option>
                    <option value="facilitator">Facilitator</option>
                    <option value="org_admin">Admin</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={sending}
                  className="h-10 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {sending ? "Sending..." : "Send Invite"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowInvite(false)}
                  className="h-10 w-10 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-accent transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 flex-1 max-w-sm">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="flex items-center rounded-lg bg-muted/50 p-0.5">
            {(["all", "learner", "facilitator", "org_admin"] as RoleFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setRoleFilter(f)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  roleFilter === f ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f === "all" ? `All (${roleCounts.all})` : `${roleLabel[f] || f} (${roleCounts[f]})`}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-5 py-3 text-left text-xs uppercase tracking-wider text-muted-foreground font-medium">User</th>
                <th className="px-5 py-3 text-left text-xs uppercase tracking-wider text-muted-foreground font-medium">Role</th>
                <th className="px-5 py-3 text-left text-xs uppercase tracking-wider text-muted-foreground font-medium">Courses</th>
                <th className="px-5 py-3 text-left text-xs uppercase tracking-wider text-muted-foreground font-medium">Joined</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u, i) => (
                <motion.tr
                  key={u.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.02 }}
                  className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors cursor-pointer group"
                  onClick={() => window.location.href = `/users/${u.id}`}
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-xs font-semibold text-primary">
                          {(u.display_name || u.email)[0].toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">{u.display_name || u.email.split("@")[0]}</p>
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${roleBadge[u.role] || roleBadge.learner}`}>
                      {roleLabel[u.role] || u.role}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-muted-foreground">{u.enrolled_courses_count}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors" />
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div className="py-12 text-center">
              <Users className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {search || roleFilter !== "all" ? "No users match your filters" : "No users yet"}
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
