"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BookOpen, Eye, EyeOff } from "lucide-react";
import { adminApi, type Course } from "@/lib/api-client";

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    adminApi.listCourses()
      .then(setCourses)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = async (course: Course) => {
    setToggling(course.id);
    try {
      if (course.status === "active") {
        await adminApi.unpublishCourse(course.id);
        setCourses((prev) => prev.map((c) => c.id === course.id ? { ...c, status: "draft", published_at: null } : c));
      } else {
        await adminApi.publishCourse(course.id);
        setCourses((prev) => prev.map((c) => c.id === course.id ? { ...c, status: "active", published_at: new Date().toISOString() } : c));
      }
    } catch (e) {
      console.error(e);
    }
    setToggling(null);
  };

  if (loading) return <div className="p-8"><div className="h-8 w-48 animate-pulse rounded bg-muted" /></div>;

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-display text-lg font-semibold text-foreground">Courses</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Manage course visibility for learners</p>
      </motion.div>

      <div className="space-y-3">
        {courses.map((course, i) => (
          <motion.div key={course.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <div className="flex items-center justify-between rounded-lg border border-border bg-card p-5">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <BookOpen className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{course.title}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{course.description}</p>
                  <span className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                    course.status === "active"
                      ? "bg-success/10 text-success"
                      : "bg-warning/10 text-warning"
                  }`}>
                    {course.status === "active" ? "Published" : "Draft"}
                  </span>
                </div>
              </div>
              <button
                onClick={() => handleToggle(course)}
                disabled={toggling === course.id}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50 ${
                  course.status === "active"
                    ? "border border-border text-muted-foreground hover:bg-muted"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                }`}
              >
                {toggling === course.id ? "..." : course.status === "active" ? (
                  <><EyeOff className="h-4 w-4" /> Unpublish</>
                ) : (
                  <><Eye className="h-4 w-4" /> Publish</>
                )}
              </button>
            </div>
          </motion.div>
        ))}
        {courses.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No courses yet. Upload materials to generate one.</p>
        )}
      </div>
    </div>
  );
}
