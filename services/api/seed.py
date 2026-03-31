"""Seed script: inserts org, users, courses, mastery profile, enrollments, and full program structure."""

import asyncio
import uuid
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.core.database import Base
from app.models.organization import Organization, PlanTier
from app.models.user import User, UserRole
from app.models.course import Course, CourseType, CourseStatus
from app.models.mastery_profile import MasteryProfile
from app.models.enrollment import Enrollment, MasteryStatus
from app.models.program import Category, Domain, Capability, Milestone, FocusSession

DATABASE_URL = "postgresql+asyncpg://postgres:postgres@localhost:5432/nexus_mastery"


async def seed():
    engine = create_async_engine(DATABASE_URL)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as db:
        # Organization
        org_id = uuid.uuid4()
        org = Organization(
            id=org_id,
            name="Acme Corp",
            slug="acme-corp",
            plan_tier=PlanTier.professional,
            settings={"branding": {"primary_color": "#0D9488"}},
        )
        db.add(org)

        # Admin user
        admin_id = uuid.uuid4()
        admin = User(
            id=admin_id,
            email="admin@acme.com",
            display_name="James Wilson",
            role=UserRole.org_admin,
            org_id=org_id,
            auth0_sub="auth0|admin-james",
        )
        db.add(admin)

        # Learner user
        learner_id = uuid.uuid4()
        learner = User(
            id=learner_id,
            email="maria@acme.com",
            display_name="Maria Chen",
            role=UserRole.learner,
            org_id=org_id,
            auth0_sub="auth0|learner-maria",
        )
        db.add(learner)

        # Courses
        course1_id = uuid.uuid4()
        course1 = Course(
            id=course1_id, org_id=org_id,
            title="Strategic Decision Making",
            description="Master the art of making high-stakes decisions under uncertainty.",
            type=CourseType.preloaded, status=CourseStatus.active,
            mastery_criteria={"target_level": 4, "competencies": ["Data-Driven Judgment", "Risk Assessment", "Stakeholder Impact Analysis"]},
        )
        db.add(course1)

        course2_id = uuid.uuid4()
        course2 = Course(
            id=course2_id, org_id=org_id,
            title="Cross-Functional Stakeholder Alignment",
            description="Learn to align diverse stakeholders across organizational boundaries.",
            type=CourseType.preloaded, status=CourseStatus.active,
            mastery_criteria={"target_level": 4, "competencies": ["Communication Clarity", "Conflict Resolution", "Influence Without Authority"]},
        )
        db.add(course2)

        # Mastery Profile
        profile = MasteryProfile(
            id=uuid.uuid4(), user_id=learner_id,
            thinking_patterns={"reasoning_style": "analytical", "strengths": ["pattern recognition", "systematic thinking"]},
            knowledge_graph={"mastered": ["basic decision frameworks"], "struggling": ["ambiguity tolerance"]},
            pacing_preferences={"optimal_session_length": 25, "difficulty_curve": "gradual"},
            course_progress={str(course1_id): {"level": 1.6, "percentage": 18}, str(course2_id): {"level": 2.1, "percentage": 35}},
        )
        db.add(profile)

        # Enrollments
        db.add(Enrollment(id=uuid.uuid4(), user_id=learner_id, course_id=course1_id, mastery_status=MasteryStatus.in_progress))
        db.add(Enrollment(id=uuid.uuid4(), user_id=learner_id, course_id=course2_id, mastery_status=MasteryStatus.in_progress))

        # ─── CATEGORY: Strategic Leadership ────────────────────────────────────
        category_id = uuid.uuid4()
        category = Category(
            id=category_id, org_id=org_id,
            name="Strategic Leadership",
            objective="Master strategic decision making and stakeholder alignment for senior leadership readiness",
            target_learner="Maria Chen · Product Manager",
            current_level=3.1, target_level=4.0, baseline_level=2.2,
            time_estimate="8 weeks",
            insight_banner="Your pattern recognition in stakeholder scenarios improved 15% this week. Your Evidence anchoring still trails your Reframing strength — focus practice there.",
            next_step_title="Distributed Team Communication",
            next_step_description="A 45-minute scenario focused on navigating stakeholder misalignment across distributed teams. Targets your declining Context Setting skill.",
        )
        db.add(category)

        # Domain 1: Analytical Thinking
        d1_id = uuid.uuid4()
        db.add(Domain(id=d1_id, program_id=category_id, domain_name="Analytical Thinking", sort_order=1))
        caps_d1 = [
            ("Data-Driven Judgment", 1.8, 3.5, 35, "critical", "declining", True, "Practice interpreting ambiguous data sets in time-constrained scenarios"),
            ("Risk Assessment", 1.2, 3.0, 22, "critical", "stable", False, "Evaluate potential outcomes using structured risk matrices"),
            ("Data Interpretation", 2.2, 3.5, 45, "attention", "improving", False, "Practice drawing conclusions from incomplete data sets"),
            ("Hypothesis Formation", 1.6, 3.0, 32, "attention", "stable", False, "Develop testable hypotheses before investigating"),
        ]
        for name, cur, tar, prog, status, trend, focus, rec in caps_d1:
            db.add(Capability(id=uuid.uuid4(), domain_id=d1_id, user_id=learner_id, name=name,
                              current_level=cur, target_level=tar, progress=prog,
                              status=status, trend=trend,
                              is_focus_skill=focus, recommendation=rec))

        # Domain 2: Strategic Vision
        d2_id = uuid.uuid4()
        db.add(Domain(id=d2_id, program_id=category_id, domain_name="Strategic Vision", sort_order=2))
        caps_d2 = [
            ("Stakeholder Impact Analysis", 0.8, 3.5, 15, "critical", "declining", False, "Map downstream effects before making recommendations"),
            ("Vision Setting", 3.2, 4.0, 72, "proficient", "improving", False, "Articulate clear long-term direction for teams"),
            ("Priority Management", 2.8, 3.5, 65, "proficient", "stable", False, "Balance competing priorities with structured frameworks"),
        ]
        for name, cur, tar, prog, status, trend, focus, rec in caps_d2:
            db.add(Capability(id=uuid.uuid4(), domain_id=d2_id, user_id=learner_id, name=name,
                              current_level=cur, target_level=tar, progress=prog,
                              status=status, trend=trend,
                              is_focus_skill=focus, recommendation=rec))

        # Domain 3: Communication
        d3_id = uuid.uuid4()
        db.add(Domain(id=d3_id, program_id=category_id, domain_name="Communication", sort_order=3))
        caps_d3 = [
            ("Context Setting", 2.6, 3.5, 58, "attention", "declining", True, "Start each conversation by framing the problem space clearly"),
            ("Conflict Resolution", 1.4, 3.0, 30, "attention", "improving", False, "Practice de-escalation and finding common ground"),
            ("Active Listening", 1.8, 3.0, 42, "attention", "stable", False, "Reflect back key points before responding"),
            ("Executive Presence", 1.0, 3.0, 20, "attention", "stable", False, "Project confidence and clarity in high-stakes settings"),
            ("Persuasion", 1.2, 3.0, 25, "attention", "improving", False, "Structure arguments with evidence before conclusions"),
        ]
        for name, cur, tar, prog, status, trend, focus, rec in caps_d3:
            db.add(Capability(id=uuid.uuid4(), domain_id=d3_id, user_id=learner_id, name=name,
                              current_level=cur, target_level=tar, progress=prog,
                              status=status, trend=trend,
                              is_focus_skill=focus, recommendation=rec))

        # Domain 4: Adaptability
        d4_id = uuid.uuid4()
        db.add(Domain(id=d4_id, program_id=category_id, domain_name="Adaptability", sort_order=4))
        caps_d4 = [
            ("Feedback Integration", 2.4, 3.5, 55, "attention", "improving", False, "Actively seek and incorporate diverse feedback"),
            ("Ambiguity Tolerance", 1.8, 3.0, 40, "attention", "stable", False, "Make progress despite incomplete information"),
        ]
        for name, cur, tar, prog, status, trend, focus, rec in caps_d4:
            db.add(Capability(id=uuid.uuid4(), domain_id=d4_id, user_id=learner_id, name=name,
                              current_level=cur, target_level=tar, progress=prog,
                              status=status, trend=trend,
                              is_focus_skill=focus, recommendation=rec))

        # Domain 5: Collaboration
        d5_id = uuid.uuid4()
        db.add(Domain(id=d5_id, program_id=category_id, domain_name="Collaboration", sort_order=5))
        caps_d5 = [
            ("Cross-Functional Partnership", 2.8, 3.5, 60, "proficient", "improving", False, "Build trust across team boundaries"),
            ("Influence Without Authority", 2.0, 3.5, 44, "attention", "improving", False, "Guide outcomes through persuasion rather than directives"),
        ]
        for name, cur, tar, prog, status, trend, focus, rec in caps_d5:
            db.add(Capability(id=uuid.uuid4(), domain_id=d5_id, user_id=learner_id, name=name,
                              current_level=cur, target_level=tar, progress=prog,
                              status=status, trend=trend,
                              is_focus_skill=focus, recommendation=rec))

        # Also mark "Show Your Work" as focus skill (it's a meta-skill, add to Analytical)
        db.add(Capability(id=uuid.uuid4(), domain_id=d1_id, user_id=learner_id,
                          name="Show Your Work", current_level=2.2, target_level=3.5, progress=45,
                          status="attention", trend="improving",
                          is_focus_skill=True, recommendation="Focus on articulating reasoning chains before reaching conclusions"))

        # Milestones
        milestones = [
            ("Complete baseline assessment", True, 1),
            ("First Clarify-stage session", True, 2),
            ("Reach Level 3.0 in any skill", True, 3),
            ("Complete 10 Arena sessions", False, 4),
            ("Achieve proficiency in 3+ skills", False, 5),
            ("Reach target mastery level", False, 6),
        ]
        for label, completed, order in milestones:
            db.add(Milestone(id=uuid.uuid4(), program_id=category_id, user_id=learner_id,
                             label=label, completed=completed, sort_order=order))

        # Focus Sessions
        sessions = [
            ("Crisis Communication Plan", "Context Setting", "Advanced", "40 min", "Communication"),
            ("Data-Driven Roadmap Defense", "Data-Driven Judgment", "Intermediate", "35 min", "Analytical Thinking"),
            ("Stakeholder Negotiation Simulation", "Influence Without Authority", "Advanced", "45 min", "Collaboration"),
        ]
        for title, skill, diff, dur, cat in sessions:
            db.add(FocusSession(id=uuid.uuid4(), program_id=category_id,
                                title=title, related_skill=skill, difficulty=diff, duration=dur, category=cat))

        await db.commit()
        print("Seed data inserted successfully!")
        print(f"  Org: {org.name} ({org.id})")
        print(f"  Admin: {admin.email} ({admin.id})")
        print(f"  Learner: {learner.email} ({learner.id})")
        print(f"  Courses: 2")
        print(f"  Category: {category.name} ({category.id})")
        print(f"  Domains: 5 with 17 capabilities (3 focus skills)")
        print(f"  Milestones: 6, Focus Sessions: 3")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
