export interface User {
  id: string;
  email: string;
  display_name: string;
  role: "superuser" | "editor" | "viewer";
}

export interface LoginResponse {
  access_token: string;
  expires_at: string;
  user: User;
}
