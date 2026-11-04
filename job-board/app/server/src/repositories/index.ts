// Repositories hold all the SQL (T-3). Everything above this layer works with plain objects,
// so moving from SQLite to PostgreSQL only touches this folder.
import type { Knex } from 'knex';
import type { Application, Job, JobApplicant, MyApplication, Profile, Role, User, WorkType } from '@jobboard/shared';

export interface UserRecord extends User {
  passwordHash: string;
}

const toUserRecord = (r: any): UserRecord => ({
  id: r.id,
  name: r.name,
  email: r.email,
  role: r.role as Role,
  companyName: r.company_name ?? null,
  passwordHash: r.password_hash,
});

export const toPublicUser = ({ passwordHash: _hash, ...user }: UserRecord): User => user;

const JOB_COLUMNS = [
  'jobs.id',
  'jobs.owner_id',
  'jobs.title',
  'jobs.location',
  'jobs.work_type',
  'jobs.salary',
  'jobs.description',
  'jobs.requirements',
  'jobs.posted_at',
  'users.company_name as company',
];

const toJob = (r: any): Job => ({
  id: r.id,
  ownerId: r.owner_id,
  title: r.title,
  company: r.company ?? '',
  location: r.location,
  workType: r.work_type as WorkType,
  salary: r.salary ?? null,
  description: r.description,
  requirements: r.requirements,
  postedAt: r.posted_at,
});

const toApplication = (r: any): Application => ({
  id: r.id,
  jobId: r.job_id,
  applicantId: r.applicant_id,
  phone: r.phone ?? null,
  coverLetter: r.cover_letter,
  appliedAt: r.applied_at,
});

// Case-insensitive "contains" pattern; % _ and \ in the user's text are matched literally.
const likePattern = (text: string) => `%${text.trim().toLowerCase().replace(/[\\%_]/g, (c) => '\\' + c)}%`;

const NEWEST_FIRST = (table: string, dateColumn: string) => [
  { column: `${table}.${dateColumn}`, order: 'desc' as const },
  { column: `${table}.id`, order: 'desc' as const },
];

export interface NewUser {
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  companyName?: string | null;
}

export interface NewJob {
  ownerId: number;
  title: string;
  location: string;
  workType: WorkType;
  salary: string | null;
  description: string;
  requirements: string;
  postedAt: string;
}

export interface NewApplication {
  jobId: number;
  applicantId: number;
  phone: string | null;
  coverLetter: string;
  appliedAt: string;
}

export function createRepos(db: Knex) {
  const jobsQuery = () => db('jobs').join('users', 'users.id', 'jobs.owner_id').select(JOB_COLUMNS);

  return {
    users: {
      async findByEmail(email: string): Promise<UserRecord | undefined> {
        const row = await db('users').whereRaw('lower(email) = ?', [email.trim().toLowerCase()]).first();
        return row && toUserRecord(row);
      },
      async findById(id: number): Promise<UserRecord | undefined> {
        const row = await db('users').where({ id }).first();
        return row && toUserRecord(row);
      },
      async insert(user: NewUser): Promise<number> {
        const [row] = await db('users')
          .insert({
            name: user.name,
            email: user.email,
            password_hash: user.passwordHash,
            role: user.role,
            company_name: user.companyName ?? null,
          })
          .returning('id');
        return row.id;
      },
    },

    sessions: {
      async create(id: string, userId: number, expiresAt: string): Promise<void> {
        await db('sessions').insert({ id, user_id: userId, expires_at: expiresAt });
      },
      async findUserId(id: string, now: string): Promise<number | undefined> {
        const row = await db('sessions').where({ id }).andWhere('expires_at', '>', now).first();
        return row?.user_id;
      },
      async delete(id: string): Promise<void> {
        await db('sessions').where({ id }).del();
      },
    },

    jobs: {
      async search(keyword: string, location: string): Promise<Job[]> {
        const q = jobsQuery();
        if (keyword.trim()) {
          const pattern = likePattern(keyword);
          q.where((b) =>
            b
              .whereRaw("lower(jobs.title) like ? escape '\\'", [pattern])
              .orWhereRaw("lower(jobs.description) like ? escape '\\'", [pattern])
              .orWhereRaw("lower(users.company_name) like ? escape '\\'", [pattern]),
          );
        }
        if (location.trim()) q.whereRaw("lower(jobs.location) like ? escape '\\'", [likePattern(location)]);
        return (await q.orderBy(NEWEST_FIRST('jobs', 'posted_at'))).map(toJob);
      },
      async findById(id: number): Promise<Job | undefined> {
        const row = await jobsQuery().where('jobs.id', id).first();
        return row && toJob(row);
      },
      async listByOwner(ownerId: number): Promise<(Job & { applicationCount: number })[]> {
        const rows = await jobsQuery()
          .select(db.raw('(select count(*) from applications a where a.job_id = jobs.id) as application_count'))
          .where('jobs.owner_id', ownerId)
          .orderBy(NEWEST_FIRST('jobs', 'posted_at'));
        return rows.map((r: any) => ({ ...toJob(r), applicationCount: Number(r.application_count) }));
      },
      async findByIds(ids: number[]): Promise<Job[]> {
        const rows = await jobsQuery().whereIn('jobs.id', ids);
        return rows.map(toJob);
      },
      async insert(job: NewJob): Promise<number> {
        const [row] = await db('jobs')
          .insert({
            owner_id: job.ownerId,
            title: job.title,
            location: job.location,
            work_type: job.workType,
            salary: job.salary,
            description: job.description,
            requirements: job.requirements,
            posted_at: job.postedAt,
          })
          .returning('id');
        return row.id;
      },
      async update(id: number, job: Omit<NewJob, 'ownerId' | 'postedAt'>): Promise<void> {
        await db('jobs').where({ id }).update({
          title: job.title,
          location: job.location,
          work_type: job.workType,
          salary: job.salary,
          description: job.description,
          requirements: job.requirements,
        });
      },
    },

    applications: {
      async insert(a: NewApplication): Promise<number> {
        const [row] = await db('applications')
          .insert({
            job_id: a.jobId,
            applicant_id: a.applicantId,
            phone: a.phone,
            cover_letter: a.coverLetter,
            applied_at: a.appliedAt,
          })
          .returning('id');
        return row.id;
      },
      async findOne(jobId: number, applicantId: number): Promise<Application | undefined> {
        const row = await db('applications').where({ job_id: jobId, applicant_id: applicantId }).first();
        return row && toApplication(row);
      },
      async findByApplicant(applicantId: number): Promise<MyApplication[]> {
        const rows = await db('applications')
          .join('jobs', 'jobs.id', 'applications.job_id')
          .join('users', 'users.id', 'jobs.owner_id')
          .select('applications.*', 'jobs.title as job_title', 'users.company_name as company')
          .where('applications.applicant_id', applicantId)
          .orderBy(NEWEST_FIRST('applications', 'applied_at'));
        return rows.map((r: any) => ({ ...toApplication(r), jobTitle: r.job_title, company: r.company ?? '' }));
      },
      async findByJob(jobId: number): Promise<JobApplicant[]> {
        const rows = await db('applications')
          .join('users', 'users.id', 'applications.applicant_id')
          .select('applications.*', 'users.name as applicant_name', 'users.email as applicant_email')
          .where('applications.job_id', jobId)
          .orderBy(NEWEST_FIRST('applications', 'applied_at'));
        return rows.map((r: any) => ({ ...toApplication(r), applicantName: r.applicant_name, applicantEmail: r.applicant_email }));
      },
    },

    profiles: {
      async find(userId: number): Promise<Profile | undefined> {
        const row = await db('profiles').where({ user_id: userId }).first();
        return row && { body: row.body, updatedAt: row.updated_at };
      },
      /** One profile per user: saving replaces the old one. */
      async save(userId: number, body: string, updatedAt: string): Promise<Profile> {
        await db('profiles')
          .insert({ user_id: userId, body, updated_at: updatedAt })
          .onConflict('user_id')
          .merge();
        return { body, updatedAt };
      },
    },

    /** Used by the seed script to start from an empty database. */
    async clearAll(): Promise<void> {
      for (const table of ['applications', 'sessions', 'profiles', 'jobs', 'users']) await db(table).del();
    },
  };
}

export type Repos = ReturnType<typeof createRepos>;
