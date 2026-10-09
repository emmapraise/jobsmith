"use client";

import { ErrorState } from "@/components/states";
import { useOnline } from "@/components/pwa/use-online";
import { Button } from "@/components/ui/button";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const online = useOnline();
  return (
    <div className="page py-12">
      <ErrorState
        title={online ? undefined : "You’re offline"}
        message={online ? "We hit an unexpected problem loading this page. Your data is safe." : "This page needs a connection. Reconnect and try again, or open a page you’ve already saved."}
        action={<Button onClick={reset}>Try again</Button>}
      />
    </div>
  );
}
