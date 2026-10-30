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
