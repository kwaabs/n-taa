import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useAzureLoginURL } from "./hooks";
import { toastError } from "@/features/notifications/store";

export function AzureLoginButton() {
  const [loading, setLoading] = useState(false);
  const getLoginURL = useAzureLoginURL();

  const onClick = async () => {
    setLoading(true);
    try {
      const { login_url } = await getLoginURL.mutateAsync();
      window.location.href = login_url;
    } catch (e) {
      setLoading(false);
      toastError(
        "Sign-in failed",
        (e as { message?: string })?.message ?? "Could not start Azure sign-in",
      );
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-white py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <MicrosoftLogo className="h-4 w-4" />
      )}
      Sign in with Microsoft
    </button>
  );
}

function MicrosoftLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 21 21">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}
