import { toast } from "sonner";

/** Moving to Interview is the moment prep matters: offer it with one tap. */
export function offerPrep(jobId: string, navigate: (href: string) => void) {
  toast.success("Interview stage. Good luck!", {
    description: "Want questions and a brief for this role?",
    duration: 10_000,
    action: { label: "Prepare", onClick: () => navigate(`/prep?job=${jobId}`) },
  });
}
