"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setEmailRemindersAction } from "@/app/(app)/settings/actions";
import { Switch } from "@/components/ui/switch";

export function EmailReminders({ initial, email }: { initial: boolean; email: string }) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <div className="flex items-start gap-4">
      <Switch
        id="email-reminders"
        checked={on}
        disabled={pending}
        aria-label="Email me reminders"
        onCheckedChange={(v) => {
          const next = Boolean(v);
          setOn(next);
          start(async () => {
            const r = await setEmailRemindersAction(next);
            if (!r.ok) { setOn(!next); toast.error(r.message); }
            else toast.success(next ? "Email reminders on" : "Email reminders off");
          });
        }}
      />
      <label htmlFor="email-reminders" className="min-w-0 flex-1 cursor-pointer">
        <span className="block font-medium text-ink">Email me when an application needs attention</span>
        <span className="mt-1 block text-sm text-ink-muted">At most one email a day to {email}, only when a follow-up is due or an application has gone quiet. Off by default.</span>
      </label>
    </div>
  );
}
