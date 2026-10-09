"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { clearOfflineData } from "@/lib/pwa";
import { deleteAccountAction } from "@/app/(app)/settings/actions";
import { ErrorState } from "@/components/states";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DeleteAccount({ email }: { email: string }) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const matches = typed.trim().toLowerCase() === email.toLowerCase();

  return (
    <AlertDialog onOpenChange={(o) => { if (!o) { setTyped(""); setError(null); } }}>
      <AlertDialogTrigger render={<Button variant="destructive" />}>
        <Trash2 data-icon="inline-start" aria-hidden="true" /> Delete my account
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your account and all data?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes your profile, master resume and every version, answers, insights, and all stored files. It cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div>
          <Label htmlFor="confirm-email" className="mb-1.5 block text-sm font-medium text-ink">
            Type <span className="font-semibold">{email}</span> to confirm
          </Label>
          <Input id="confirm-email" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className="h-11" />
        </div>
        {error && <ErrorState message={error} />}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={!matches || pending}
            onClick={() =>
              start(async () => {
                await clearOfflineData(); // the account (and anything saved from it) is going away
                const r = await deleteAccountAction(typed);
                if (r && !r.ok) setError(r.message);
              })
            }
          >
            {pending ? "Deleting…" : "Delete everything"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
