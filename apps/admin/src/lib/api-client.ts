const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const DEV_MODE = process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true";
const DEV_AUTH = process.env.NEXT_PUBLIC_DEV_AUTH === "true";
const DEV_TOKEN = "dev:auth0|admin-james";

let _cachedToken: string | null = null;

async function getToken(): Promise<string> {
  // Always use dev token until Auth0 is fully configured
  return DEV_TOKEN;
}

async function authRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers as Record<string, string>),
    },
  });
  if (response.status === 401) {
    _cachedToken = null;
    if (typeof window !== "undefined") window.location.href = "/auth/login";
    throw new Error("Session expired");
  }
  if (response.status === 403) {
    const body = await response.json().catch(() => ({}));
    if (body.detail?.includes("No account found")) {
      if (typeof window !== "undefined") window.location.href = "/onboarding";
      throw new Error("Redirecting to onboarding");
    }
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(body.detail || `API error ${response.status}`);
  }
  if (response.status === 204 || response.headers.get("content-length") === "0") {
    return {} as T;
  }
  return response.json();
}

async function authMultipart<T>(path: string, files: File[]): Promise<T> {
  const token = await getToken();
  const formData = new FormData();
  files.forEach((f) => formData.append("files", f));
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
  return response.json();
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CourseFile {
  id: string;
  course_id: string | null;
  original_filename: string;
  file_type: string;
  file_size: number;
  upload_status: string;
  created_at: string;
}

export interface IngestionJob {
  id: string;
  status: string;
  progress_pct: number;
  current_step: string | null;
  chunks_total: number | null;
  chunks_processed: number;
  ai_generated_metadata: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface AdminUser {
  id: string;
  display_name: string | null;
  email: string;
  role: string;
  enrolled_courses_count: number;
  created_at: string;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  type: string;
  status: string;
  org_id: string;
  source_type?: string;
  published_at?: string | null;
}

export interface Category {
  id: string;
  name: string;
  objective: string | null;
  current_level: number;
  target_level: number;
  domains: Array<{ id: string; domain_name: string; capabilities: Array<{ id: string; name: string; progress: number }> }>;
  focus_sessions: Array<{ id: string; title: string; difficulty: string }>;
  milestones: Array<{ id: string; label: string; completed: boolean }>;
}

export interface AnalyticsOverview {
  total_learners: number;
  active_learners: number;
  total_categories: number;
  avg_completion_rate: number;
  top_categories: Array<{ name: string; enrolled: number; avg_progress: number }>;
  recent_activity: Array<{ user: string; action: string; detail: string; time: string }>;
}

export interface Organization {
  id: string;
  name: string;
  plan_tier: string;
  settings: Record<string, unknown>;
}

// ─── API Client ──────────────────────────────────────────────────────────────

export const adminApi = {
  // Analytics
  getOverview: () => authRequest<AnalyticsOverview>("/api/admin/analytics/overview"),
  getCourseAnalytics: () => authRequest<Array<{ name: string; enrolled: number; active: number; avg_completion: number }>>("/api/admin/analytics/courses"),

  // Upload & Generate
  uploadFiles: (files: File[]) => authMultipart<{ files: CourseFile[] }>("/api/admin/upload", files),
  generateCourse: (fileIds: string[]) => authRequest<IngestionJob>("/api/admin/courses/generate", {
    method: "POST",
    body: JSON.stringify({ file_ids: fileIds }),
  }),
  generateFromPrompt: (prompt: string) => authRequest<IngestionJob>("/api/admin/courses/generate-from-prompt", {
    method: "POST",
    body: JSON.stringify({ prompt }),
  }),
  pollIngestion: (jobId: string) => authRequest<IngestionJob>(`/api/admin/ingestion/${jobId}`),

  // Categories
  listCategories: () => authRequest<Array<{ id: string; name: string; current_level: number; target_level: number }>>("/api/categories"),
  getCategory: (id: string) => authRequest<Category>(`/api/categories/${id}`),
  createCategory: (data: { name: string; objective?: string }) => authRequest<Category>("/api/categories", {
    method: "POST",
    body: JSON.stringify(data),
  }),

  deleteCategory: (id: string) => authRequest(`/api/categories/${id}`, { method: "DELETE" }),

  // Courses
  listCourses: () => authRequest<Course[]>("/api/courses"),
  publishCourse: (id: string) => authRequest(`/api/admin/courses/${id}/publish`, { method: "POST" }),
  unpublishCourse: (id: string) => authRequest(`/api/admin/courses/${id}/unpublish`, { method: "POST" }),

  // Users
  listUsers: () => authRequest<AdminUser[]>("/api/admin/users"),
  inviteUser: (data: { email: string; role: string }) => authRequest("/api/admin/users/invite", {
    method: "POST",
    body: JSON.stringify(data),
  }),
  bulkImport: (file: File) => authMultipart<{ total: number; valid_count: number; valid: unknown[]; errors: unknown[] }>("/api/admin/users/bulk-import", [file]),

  // Settings
  getOrg: () => authRequest<Organization>("/api/orgs/me"),
  updateSettings: (data: Record<string, unknown>) => authRequest("/api/admin/org/settings", {
    method: "PATCH",
    body: JSON.stringify(data),
  }),
};
