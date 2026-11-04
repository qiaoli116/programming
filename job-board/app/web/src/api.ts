// The only place the browser talks to the server (T-5). Pages call these typed functions, never fetch().
import type {
  Application,
  ApplicationForm,
  ApiError,
  EmployerJob,
  Job,
  JobApplicant,
  JobForm,
  JobScore,
  MyApplication,
  Profile,
  User,
} from '@jobboard/shared';

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiRequestError(0, 'NETWORK', 'Could not reach the server. Check your connection and try again.');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const error = (data as ApiError | null)?.error;
    throw new ApiRequestError(res.status, error?.code ?? 'ERROR', error?.message ?? 'Something went wrong.', error?.fields);
  }
  return data as T;
}

export const api = {
  me: () => request<{ user: User | null }>('GET', '/auth/me').then((r) => r.user),
  signIn: (email: string, password: string) => request<{ user: User }>('POST', '/auth/sign-in', { email, password }).then((r) => r.user),
  signOut: () => request<void>('POST', '/auth/sign-out'),

  searchJobs: (keyword: string, location: string) => {
    const query = new URLSearchParams();
    if (keyword) query.set('keyword', keyword);
    if (location) query.set('location', location);
    const qs = query.toString();
    return request<{ jobs: Job[] }>('GET', `/jobs${qs ? `?${qs}` : ''}`).then((r) => r.jobs);
  },
  getJob: (id: number | string) => request<{ job: Job }>('GET', `/jobs/${id}`).then((r) => r.job),
  createJob: (form: JobForm) => request<{ job: Job }>('POST', '/jobs', form).then((r) => r.job),
  updateJob: (id: number | string, form: JobForm) => request<{ job: Job }>('PUT', `/jobs/${id}`, form).then((r) => r.job),

  apply: (jobId: number | string, form: ApplicationForm) =>
    request<{ application: MyApplication }>('POST', `/jobs/${jobId}/applications`, form).then((r) => r.application),
  myApplications: () => request<{ applications: MyApplication[] }>('GET', '/me/applications').then((r) => r.applications),

  getProfile: () => request<{ profile: Profile }>('GET', '/me/profile').then((r) => r.profile),
  saveProfile: (body: string) => request<{ profile: Profile }>('PUT', '/me/profile', { body }).then((r) => r.profile),
  score: (jobIds: number[]) => request<{ results: JobScore[] }>('POST', '/scoring', { jobIds }).then((r) => r.results),

  employerJobs: () => request<{ jobs: EmployerJob[] }>('GET', '/employer/jobs').then((r) => r.jobs),
  jobApplications: (jobId: number | string) =>
    request<{ job: Job; applications: JobApplicant[] }>('GET', `/jobs/${jobId}/applications`),
};

export type { Application };
