import { z } from "zod";

export const WORK_MODES = ["remote", "hybrid", "onsite"] as const;
export const SENIORITY = ["intern", "junior", "mid", "senior", "staff", "principal", "manager", "director"] as const;
export const AUTH_STATUS = ["citizen_or_settled", "work_visa", "need_sponsorship", "student_visa", "unsure"] as const;

export const profileSchema = z.object({
  headlineGoal: z.string().max(500), // what the user wants next, in their words
  seniority: z.enum(SENIORITY).nullable(),
  yearsExperience: z.number().min(0).max(60).nullable(),
  targetRoles: z.array(z.string().max(80)).max(10),
  currentCountry: z.string().max(80),
  preferredCountries: z.array(z.string().max(80)).max(20),
  openToRelocation: z.boolean().nullable(),
  workModes: z.array(z.enum(WORK_MODES)),
  salaryMin: z.number().int().min(0).nullable(),
  salaryCurrency: z.string().length(3).nullable(),
  salaryPeriod: z.enum(["year", "month"]).nullable(),
  authorizationNotes: z.string().max(500), // e.g. "Nigerian citizen, UK Skilled Worker needed"
  authorizationStatus: z.enum(AUTH_STATUS).nullable(),
  needsVisaSponsorship: z.boolean().nullable(),
  dealBreakers: z.string().max(500),
});

export type ProfileData = z.infer<typeof profileSchema>;

export const emptyProfile = (): ProfileData => ({
  headlineGoal: "",
  seniority: null,
  yearsExperience: null,
  targetRoles: [],
  currentCountry: "",
  preferredCountries: [],
  openToRelocation: null,
  workModes: [],
  salaryMin: null,
  salaryCurrency: null,
  salaryPeriod: null,
  authorizationNotes: "",
  authorizationStatus: null,
  needsVisaSponsorship: null,
  dealBreakers: "",
});
