"use client";

import { ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="page py-12">
      <ErrorState
        message="We hit an unexpected problem loading this page. Your data is safe."
        action={<Button onClick={reset}>Try again</Button>}
      />
    </div>
  );
}
