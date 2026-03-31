/**
 * Auth helpers for the frontend.
 * When NEXT_PUBLIC_USE_MOCK_DATA=true, uses dev-mode bypass.
 * When false, uses Auth0.
 */

export const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true";

export interface AuthUser {
  sub: string;
  email: string;
  name: string;
  role: "learner" | "org_admin" | "facilitator";
}

// Dev-mode mock users
export const MOCK_LEARNER: AuthUser = {
  sub: "auth0|learner-maria",
  email: "maria@acme.com",
  name: "Maria Chen",
  role: "learner",
};

export const MOCK_ADMIN: AuthUser = {
  sub: "auth0|admin-james",
  email: "james@acme.com",
  name: "James Wilson",
  role: "org_admin",
};
