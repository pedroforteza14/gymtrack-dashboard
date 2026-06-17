import { api } from "./api";

export type UserRole = "OWNER" | "MARKETING";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export async function login(email: string, password: string): Promise<User> {
  const { data } = await api.post("/auth/login", { email, password });
  localStorage.setItem("token", data.token);
  localStorage.setItem("role", data.user.role);
  return data.user;
}

export function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  window.location.href = "/login";
}

export function isAuthenticated() {
  return !!localStorage.getItem("token");
}

export function getRole(): UserRole | null {
  return (localStorage.getItem("role") as UserRole) ?? null;
}

export async function getMe(): Promise<User> {
  const { data } = await api.get("/auth/me");
  return data;
}
