import { useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { AppShell } from "@/app/layout/AppShell";
import { MapProvider } from "@/features/map/context/MapContext";
import { MapCanvas } from "@/features/map/components/MapCanvas";
import { MapToolCluster } from "@/features/map/components/MapToolCluster";
import { LoginScreen } from "@/features/auth/LoginScreen";
import { FeatureDrawer } from "@/features/features/FeatureDrawer";
import { useAuthStore } from "@/features/auth/store";
import { bootstrapAuth } from "@/features/auth/hooks";
import { queryClient } from "@/lib/queryClient";

import { ResultsTable } from "@/features/spatial/ResultsTable";

import { BufferMenu } from "@/features/spatial/BufferMenu";

import { PrintModal } from "@/features/print/PrintModal";

import { ToastContainer } from "@/features/notifications/ToastContainer";

import { AdminModal } from "@/features/admin/AdminModal";

function AuthGate() {
  // Detect Azure OAuth callback at any URL — Microsoft redirects here after sign-in
  // with ?code=...&state=... in the query string.
  const search = new URLSearchParams(window.location.search);
  const isAzureCallback = search.has("code") && search.has("state");

  if (isAzureCallback) {
    return (
      <>
        <AzureCallback />
        <ToastContainer />
      </>
    );
  }

  const status = useAuthStore((s) => s.status);
  const setUser = useAuthStore((s) => s.setUser);
  const setStatus = useAuthStore((s) => s.setStatus);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const user = await bootstrapAuth();
      if (cancelled) return;
      if (user) {
        setUser(user);
        setStatus("authenticated");
      } else {
        setStatus("anonymous");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setUser, setStatus]);

  if (status === "loading") {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-100">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (status === "anonymous") {
    return (
      <>
        <LoginScreen />
        <ToastContainer />
      </>
    );
  }

  return (
    <MapProvider>
      <AppShell>
        <MapCanvas />
        <MapToolCluster />
        <FeatureDrawer />
        <ResultsTable />
        <BufferMenu />
        <PrintModal />
      </AppShell>
      <AdminModal />
      <ToastContainer />
    </MapProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthGate />
    </QueryClientProvider>
  );
}
