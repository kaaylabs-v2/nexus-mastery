const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface ApiError {
  detail: string;
  status: number;
}

const DEV_TOKEN = process.env.NEXT_PUBLIC_DEV_TOKEN || "dev:auth0|learner-maria";

class ApiClient {
  private token: string | null = DEV_TOKEN;

  setToken(token: string | null) {
    this.token = token;
  }

  private async ensureToken(): Promise<void> {
    if (this.token) return;
    this.token = DEV_TOKEN;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    await this.ensureToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error: ApiError = {
        detail: "Request failed",
        status: response.status,
      };
      try {
        const body = await response.json();
        error.detail = body.detail || error.detail;
      } catch {
        // ignore parse errors
      }
      throw error;
    }

    return response.json();
  }

  // Auth
  async getMe() {
    return this.request<{
      id: string;
      email: string;
      name: string;
      role: string;
      org_id: string;
    }>("/api/auth/me");
  }

  // Courses
  async listCourses() {
    return this.request<Array<{
      id: string;
      title: string;
      description: string;
      course_type: string;
      course_category: "coding" | "business" | "science" | "creative" | "general";
      status: string;
      org_id: string;
    }>>("/api/courses");
  }

  async createCourse(data: {
    title: string;
    description: string;
    course_type?: string;
    status?: string;
    org_id: string;
  }) {
    return this.request("/api/courses", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Quizzes
  async getPlacementQuiz(courseId: string) {
    return this.request<{
      quiz_title: string;
      questions: Array<{
        id: number;
        type: "multiple_choice" | "true_false" | "scenario";
        difficulty: number;
        question: string;
        context: string | null;
        options: Array<{ id: string; text: string }>;
        correct_answer: string | null;
        explanation: string;
      }>;
    }>(`/api/courses/${courseId}/quiz`);
  }

  async submitQuiz(courseId: string, data: { answers: Record<string, string>; questions: Array<Record<string, unknown>> }) {
    return this.request<{
      score: number;
      total: number;
      percentage: number;
      teach_depth: "foundational" | "intermediate" | "advanced";
      familiarity: string;
      skip_to_mode: string;
      results: Array<{
        id: number;
        correct: boolean | null;
        user_answer: string | null;
        correct_answer: string | null;
        explanation: string;
      }>;
    }>(`/api/courses/${courseId}/quiz/submit`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Conversations
  async listConversations() {
    return this.request<Array<{
      id: string;
      course_id: string;
      session_type: string;
      session_mode: string;
      started_at: string;
      ended_at: string | null;
      messages: Array<{ role: string; content: string; timestamp: string }>;
      current_topic_id: number | null;
      topics_covered: number[] | null;
    }>>("/api/conversations");
  }

  async createConversation(courseId: string, sessionType?: string) {
    return this.request<{
      id: string;
      course_id: string;
      session_type: string;
      messages: Array<{ role: string; content: string; timestamp: string }>;
    }>("/api/conversations", {
      method: "POST",
      body: JSON.stringify({
        course_id: courseId,
        session_type: sessionType || "guided_learning",
      }),
    });
  }

  async getConversation(id: string) {
    return this.request<{
      id: string;
      course_id: string;
      session_type: string;
      session_mode: string;
      messages: Array<{ role: string; content: string; timestamp: string }>;
      current_topic_id: number | null;
      topics_covered: number[] | null;
    }>(`/api/conversations/${id}`);
  }

  async addMessage(conversationId: string, content: string) {
    return this.request(`/api/conversations/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
  }

  // Courses — learner facing
  async listMyCourses() {
    return this.request<Array<{ id: string; title: string; description: string; status: string }>>("/api/courses/me/enrolled");
  }

  async listAvailableCourses() {
    return this.request<Array<{ id: string; title: string; description: string; status: string }>>("/api/courses/me/available");
  }

  // Enrollments
  async enrollInCourse(courseId: string) {
    return this.request("/api/enrollments", {
      method: "POST",
      body: JSON.stringify({ course_id: courseId }),
    });
  }

  // Session completion
  async completeSession(conversationId: string) {
    return this.request<{ status: string; assessment?: Record<string, unknown> }>(
      `/api/conversations/${conversationId}/complete`,
      { method: "POST" }
    );
  }

  // Mastery
  async getMyProfile() {
    return this.request<{
      id: string;
      user_id: string;
      thinking_patterns: Record<string, unknown>;
      knowledge_graph: Record<string, unknown>;
      pacing_preferences: Record<string, unknown>;
      course_progress: Record<string, unknown>;
    }>("/api/mastery/me/profile");
  }

  async getMyEnrollments() {
    return this.request<Array<{
      id: string;
      user_id: string;
      course_id: string;
      mastery_status: string;
    }>>("/api/mastery/enrollments/me");
  }

  async getLearnerAnalytics() {
    return this.request<{
      overall: {
        total_sessions: number;
        total_messages: number;
        courses_enrolled: number;
        courses_completed: number;
        current_streak_days: number;
      };
      growth: Array<{
        date: string;
        sessions: number;
        messages: number;
      }>;
      by_course: Array<{
        course_id: string;
        course_title: string;
        sessions_completed: number;
        total_messages: number;
        topics_covered: number;
        total_topics: number;
        current_mode: string | null;
        last_session_at: string | null;
        mastery_status: string;
      }>;
      learner_insights: {
        reasoning_style?: string;
        strengths?: string[];
        gaps?: string[];
        concepts_mastered?: string[];
        concepts_struggling?: string[];
        connections_made?: string[];
        pacing?: Record<string, unknown>;
        recent_sessions?: Array<string | Record<string, unknown>>;
      } | null;
    }>("/api/mastery/analytics/me");
  }

  // Organization
  async getMyOrg() {
    return this.request<{
      id: string;
      name: string;
      plan_tier: string;
      settings: Record<string, unknown>;
    }>("/api/orgs/me");
  }

  async getOrgEnrollments() {
    return this.request("/api/mastery/enrollments/org");
  }

  async getOrgEnrollmentCount() {
    return this.request<{ count: number }>("/api/mastery/enrollments/org/count");
  }

  // Categories
  async listCategories() {
    return this.request<Array<{
      id: string;
      name: string;
      current_level: number;
      target_level: number;
    }>>("/api/categories");
  }

  async getActiveCategory() {
    return this.request<{
      id: string;
      name: string;
      objective: string | null;
      target_learner: string | null;
      current_level: number;
      target_level: number;
      baseline_level: number;
      time_estimate: string | null;
      insight_banner: string | null;
      next_step_title: string | null;
      next_step_description: string | null;
      domains: Array<{
        id: string;
        domain_name: string;
        capabilities: Array<{
          id: string;
          name: string;
          current_level: number;
          target_level: number;
          progress: number;
          status: string;
          trend: string;
          recommendation: string | null;
          is_focus_skill: boolean;
        }>;
      }>;
      milestones: Array<{ id: string; label: string; completed: boolean }>;
      focus_sessions: Array<{
        id: string;
        title: string;
        related_skill: string | null;
        difficulty: string;
        duration: string;
        category: string | null;
      }>;
      focus_skills: Array<{
        id: string;
        name: string;
        current_level: number;
        target_level: number;
        progress: number;
        status: string;
        trend: string;
        domain: string;
        recommendation: string | null;
      }>;
      strengths: Array<{ name: string; progress: number }>;
      focus_areas: Array<{ name: string; progress: number; gap: string; detail: string }>;
    }>("/api/categories/active/me");
  }

  // STT — transcribe audio blob via Deepgram
  async speechToText(audioBlob: Blob): Promise<string> {
    await this.ensureToken();
    const formData = new FormData();
    formData.append("audio", audioBlob, "recording.webm");

    const headers: Record<string, string> = {};
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;

    const response = await fetch(`${API_BASE}/api/voice/stt`, {
      method: "POST",
      headers,
      body: formData,
    });
    if (!response.ok) throw new Error("STT failed");
    const data = await response.json();
    return data.transcript || "";
  }

  // TTS
  async textToSpeech(text: string): Promise<ArrayBuffer> {
    await this.ensureToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;

    const response = await fetch(`${API_BASE}/api/voice/tts`, {
      method: "POST",
      headers,
      body: JSON.stringify({ text: text.slice(0, 2000) }),
    });
    if (!response.ok) throw new Error(`TTS failed: ${response.status}`);
    return response.arrayBuffer();
  }

  // WebSocket URLs
  getWebSocketUrl(conversationId: string): string {
    const wsBase = API_BASE.replace(/^http/, "ws");
    return `${wsBase}/api/conversations/${conversationId}/stream`;
  }

  getVoiceWebSocketUrl(): string {
    const wsBase = API_BASE.replace(/^http/, "ws");
    return `${wsBase}/api/voice/stream`;
  }
}

export const apiClient = new ApiClient();
export type { ApiError };
