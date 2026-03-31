"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { UserPlus, Upload, Search } from "lucide-react";
import { adminApi, type AdminUser } from "@/lib/api-client";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("learner");

  useEffect(() => {
    adminApi.listUsers().then(setUsers).catch(console.error).finally(() => setLoading(false));
  }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminApi.inviteUser({ email: inviteEmail, role: inviteRole });
      setShowInvite(false);
      setInviteEmail("");
      const updated = await adminApi.listUsers();
      setUsers(updated);
    } catch (err) {
      alert(String(err));
    }
  };

  const handleCSVImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await adminApi.bulkImport(file);
      alert(`Imported: ${result.valid_count} valid, ${result.errors.length} errors`);
    } catch (err) {
      alert(String(err));
    }
  }, []);

  const filtered = users.filter((u) =>
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.display_name || "").toLowerCase().includes(search.toLowerCase())
  );

  const roleBadge: Record<string, string> = {
    org_admin: "bg-purple-100 text-purple-700",
    facilitator: "bg-blue-100 text-blue-700",
    learner: "bg-muted text-muted-foreground",
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-lg font-semibold text-foreground">Users</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{users.length} members</p>
        </div>
        <div className="flex gap-2">
          <label className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-accent cursor-pointer">
            <Upload className="h-3.5 w-3.5" /> CSV Import
            <input type="file" accept=".csv" onChange={handleCSVImport} className="hidden" />
          </label>
          <button onClick={() => setShowInvite(!showInvite)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90">
            <UserPlus className="h-3.5 w-3.5" /> Invite
          </button>
        </div>
      </motion.div>

      {showInvite && (
        <motion.form initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} onSubmit={handleInvite}
          className="flex items-end gap-3 rounded-lg border border-border bg-card p-5">
          <div className="flex-1">
            <label className="block text-xs font-medium text-muted-foreground">Email</label>
            <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} type="email" required
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground">Role</label>
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}
              className="mt-1 rounded-md border border-border bg-background px-3 py-2 text-xs outline-none">
              <option value="learner">Learner</option>
              <option value="facilitator">Facilitator</option>
              <option value="org_admin">Admin</option>
            </select>
          </div>
          <button type="submit" className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground">Send</button>
        </motion.form>
      )}

      <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users..."
          className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground" />
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-5 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">User</th>
              <th className="px-5 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Role</th>
              <th className="px-5 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Enrollments</th>
              <th className="px-5 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Joined</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id} className="border-b border-border last:border-0">
                <td className="px-5 py-3">
                  <p className="text-xs font-medium text-foreground">{u.display_name || u.email.split("@")[0]}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </td>
                <td className="px-5 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${roleBadge[u.role] || roleBadge.learner}`}>{u.role}</span>
                </td>
                <td className="px-5 py-3 text-xs text-muted-foreground">{u.enrolled_courses_count}</td>
                <td className="px-5 py-3 text-xs text-muted-foreground">
                  {new Date(u.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
