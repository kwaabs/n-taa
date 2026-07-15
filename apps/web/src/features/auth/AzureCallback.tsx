import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { useAzureCallback } from "./hooks";

let processedCode: string | null = null;

export function AzureCallback() {
  const azureCallback = useAzureCallback();
  const [pending, setPending] = useState<{
    email: string;
    name: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const azureError = params.get("error_description");

    if (azureError) {
      setError(decodeURIComponent(azureError));
      return;
    }
    if (!code || !state) {
      setError("Missing authorization code");
      return;
    }

    if (processedCode === code) return;
    processedCode = code;

    azureCallback.mutate(
      { code, state },
      {
        onSuccess: (res) => {
          console.log("[AzureCallback] onSuccess", res);
          if (res.pending) {
            setPending({
              email: res.user.email,
              name: res.user.display_name,
            });
            window.history.replaceState({}, "", "/");
            return;
          }
          // For non-pending, useAzureCallback hook already set auth state.
          // AuthGate will re-render and show the map.
          // No need to force navigation.
        },
        onError: (err) => {
          console.error("[AzureCallback] onError", err);
          setError((err as { message?: string })?.message ?? "Sign-in failed");
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-slate-100">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
        {pending ? (
          <PendingApproval email={pending.email} name={pending.name} />
        ) : error ? (
          <ErrorState error={error} />
        ) : (
          <LoadingState />
        )}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="text-center">
      <Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-600" />
      <div className="mt-4 text-sm text-slate-600">Signing you in…</div>
    </div>
  );
}

function PendingApproval({ email, name }: { email: string; name: string }) {
  return (
    <div className="text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
        <CheckCircle2 className="h-6 w-6 text-amber-600" />
      </div>
      <h1 className="mt-4 text-lg font-semibold text-slate-800">
        Awaiting approval
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        Hi {name}, your account ({email}) is being set up. An administrator
        needs to approve your access before you can sign in.
      </p>
      <p className="mt-4 text-xs text-slate-500">
        Please contact your administrator or try again later.
      </p>
      <a className="py-2 text-sm font-medium text-white hover:bg-emerald-700">
        Back to sign in
      </a>
    </div>
  );
}

function ErrorState({ error }: { error: string }) {
  useEffect(() => {
    window.history.replaceState({}, "", "/");
  }, []);

  return (
    <div className="text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
        <XCircle className="h-6 w-6 text-red-600" />
      </div>
      <h1 className="mt-4 text-lg font-semibold text-slate-800">
        Sign-in failed
      </h1>
      <p className="mt-2 text-sm text-slate-600">{error}</p>
      <a className="mt-6 inline-block rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
        Back to sign in
      </a>
    </div>
  );
}
