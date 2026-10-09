import { PageHeader } from "@/components/page-header";
import { ProfileWizard } from "@/components/profile/profile-wizard";
import { requireUser } from "@/lib/auth/session";
import { getProfile } from "@/lib/profile/repo";
import { estimateYearsExperience } from "@/lib/resume/checks";
import { getMasterResume } from "@/lib/resume/repo";

export const metadata = { title: "Your profile" };

export default async function ProfilePage() {
  const user = await requireUser();
  const [profile, master] = await Promise.all([getProfile(user.id), getMasterResume(user.id)]);
  const years = master ? estimateYearsExperience(master.content) : null;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Profile"
        title={profile.completed ? "Edit your profile" : "Tell us what you want next"}
        description="A few short questions so we can match roles to your goals, location and visa situation. Only you can see your answers."
      />
      <ProfileWizard initial={profile.data} suggestedYears={years} />
    </div>
  );
}
