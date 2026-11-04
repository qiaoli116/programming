// Types shared by the server and the web app. The API is the contract between them.

export type Role = 'seeker' | 'employer';
export type WorkType = 'Full-time' | 'Part-time' | 'Contract' | 'Casual';

export const WORK_TYPES: WorkType[] = ['Full-time', 'Part-time', 'Contract', 'Casual'];

/** The signed-in user as the browser sees it. Never includes the password hash. */
export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  companyName: string | null;
}

export interface Job {
  id: number;
  ownerId: number;
  title: string;
  company: string;
  location: string;
  workType: WorkType;
  salary: string | null;
  description: string;
  requirements: string;
  postedAt: string; // ISO date-time
}

export interface JobForm {
  title: string;
  location: string;
  workType: WorkType;
  salary?: string;
  description: string;
  requirements: string;
}

export interface ApplicationForm {
  phone?: string;
  coverLetter: string;
}

export interface Application {
  id: number;
  jobId: number;
  applicantId: number;
  phone: string | null;
  coverLetter: string;
  appliedAt: string;
}

export interface MyApplication extends Application {
  jobTitle: string;
  company: string;
}

export interface JobApplicant extends Application {
  applicantName: string;
  applicantEmail: string;
}

export interface EmployerJob extends Job {
  applicationCount: number;
}

export interface ApiError {
  error: { code: string; message: string; fields?: Record<string, string> };
}

// ---- Iteration 2: AI match scoring

export const MATCH_LEVELS = ['Meets', 'Partly', 'Does not meet', 'Unknown'] as const;
export type MatchLevel = (typeof MATCH_LEVELS)[number];

/** A seeker's free-text Markdown profile. updatedAt is null when it was never saved. */
export interface Profile {
  body: string;
  updatedAt: string | null;
}

export interface Criterion {
  criterion: string;
  level: MatchLevel;
  reason: string;
}

export interface JobScore {
  jobId: number;
  status: 'scored' | 'no_criteria' | 'not_scored';
  criteria: Criterion[]; // 0 to 5; empty unless status is 'scored'
  overall: number | null; // 0 to 1; null when nothing could be checked
  checked: number; // criteria whose level is not Unknown
}

export const MAX_CRITERIA = 5;
export const MAX_PROFILE_LENGTH = 20000;
export const MAX_JOBS_PER_SCORING = 20;
