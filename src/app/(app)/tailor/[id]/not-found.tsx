import Link from "next/link";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="page py-12">
      <EmptyState icon={<SearchX aria-hidden="true" />} title="We couldn’t find that tailored resume" description="It may have been deleted." action={<Button render={<Link href="/tailor" />}>Back to tailored resumes</Button>} />
    </div>
  );
}
