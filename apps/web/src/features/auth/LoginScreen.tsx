import { useState, type FormEvent } from "react";
import { Globe2, Loader2 } from "lucide-react";
import { useLogin } from "./hooks";

export function LoginScreen() {
  const [email, setEmail] = useState("admin@geo.local");
  const [password, setPassword] = useState("");
  const login = useLogin();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate({ email, password });
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-slate-100">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl bg-white p-6 shadow-lg"
      >
        <div className="flex items-center gap-2">
          <Globe2 className="h-6 w-6 text-emerald-600" />
          <span className="text-lg font-semibold text-slate-800">Geo App</span>
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            required
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-slate-700">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            required
          />
        </div>

        {login.isError && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {(login.error as { message?: string })?.message ?? "Login failed"}
          </div>
        )}

        <button
          type="submit"
          disabled={login.isPending}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {login.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Sign in
        </button>
      </form>
    </div>
  );
}
