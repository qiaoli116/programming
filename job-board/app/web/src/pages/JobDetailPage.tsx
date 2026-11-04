// S-02 Job detail (UC-02), with the entry point to UC-03
import { Link, useParams } from 'react-router-dom';
import type { Job } from '@jobboard/shared';
import { api } from '../api';
import { useAuth } from '../auth';
import { JobMeta, Loading, Notice, NotFoundCard, Page } from '../components/ui';
import { formatDate, lines, paragraphs } from '../format';
import { MatchBadge } from '../components/ui';
import { useScores } from '../scores';
import { useLoad } from '../useLoad';

const LEVEL_CLASS = { Meets: 'meets', Partly: 'partly', 'Does not meet': 'no', Unknown: 'unknown' } as const;

/** UC-12: the criteria behind the overall number. Shown only for jobs scored in this visit. */
function MatchBox({ jobId }: { jobId: number }) {
  const { scores } = useScores();
  const score = scores[jobId];
  if (!score) return null;
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <b>Match with your profile</b>
        <MatchBadge score={score} />
      </div>
      {score.status === 'scored' ? (
        <ul className="criteria">
          {score.criteria.map((c, i) => (
            <li key={i}>
              <span className="name">{c.criterion}</span>
              <span className={`level ${LEVEL_CLASS[c.level]}`}>{c.level}</span>
              <span className="reason">{c.reason}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small" style={{ margin: '6px 0 0' }}>
          {score.status === 'no_criteria' ? 'No criteria found in this posting.' : 'Scoring failed for this job. Go back to the results and try again.'}
        </p>
      )}
      <p className="small muted" style={{ margin: '10px 0 0' }}>
        Scored by AI from your profile. Advisory only.
      </p>
    </div>
  );
}

function ApplyBox({ job }: { job: Job }) {
  const { user } = useAuth();
  const seeker = user?.role === 'seeker';
  const { data: applications } = useLoad(() => (seeker ? api.myApplications() : Promise.resolve([])), [seeker, user?.id]);
  const applied = applications?.find((a) => a.jobId === job.id);

  if (!user) {
    return (
      <div className="card">
        <h3>Interested?</h3>
        <p className="small muted">You need to be signed in as a job seeker to apply.</p>
        <Link
          className="btn block"
          to="/sign-in"
          state={{ from: `/jobs/${job.id}/apply`, notice: `Please sign in to apply for ${job.title} at ${job.company}.` }}
        >
          Sign in to apply
        </Link>
      </div>
    );
  }
  if (user.role === 'employer') {
    return (
      <div className="card">
        <h3>Employer account</h3>
        <p className="small muted" style={{ margin: 0 }}>
          Only job seekers can apply for jobs.
        </p>
        {job.ownerId === user.id && (
          <p style={{ margin: '10px 0 0' }}>
            <Link className="btn secondary block" to={`/employer/jobs/${job.id}/applications`}>
              View applications
            </Link>
          </p>
        )}
      </div>
    );
  }
  if (applied) {
    return (
      <div className="card">
        <h3>Application sent</h3>
        <p className="small muted">You applied for this job on {formatDate(applied.appliedAt)}.</p>
        <Link className="btn secondary block" to="/my-applications">
          View my applications
        </Link>
      </div>
    );
  }
  return (
    <div className="card">
      <h3>Interested?</h3>
      <p className="small muted">It takes about two minutes.</p>
      <Link className="btn block" to={`/jobs/${job.id}/apply`}>
        Apply for this job
      </Link>
    </div>
  );
}

export function JobDetailPage() {
  const { id } = useParams();
  const { data: job, error, loading } = useLoad(() => api.getJob(id!), [id]);

  if (loading) {
    return (
      <Page>
        <Loading />
      </Page>
    );
  }
  if (error?.status === 404 || !job) {
    return (
      <Page>
        {error && error.status !== 404 ? <Notice kind="err">{error.message}</Notice> : <NotFoundCard />}
      </Page>
    );
  }

  return (
    <Page>
      <div className="crumbs">
        <Link to="/">← Back to search results</Link>
      </div>
      <div className="detail">
        <div>
          <div className="card">
            <h1>{job.title}</h1>
            <div style={{ fontWeight: 600 }}>{job.company}</div>
            <JobMeta job={job} />
          </div>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>About the role</h2>
            {paragraphs(job.description).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            <h2>Requirements</h2>
            <ul>
              {lines(job.requirements).map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        </div>
        <aside>
          <ApplyBox job={job} />
          <MatchBox jobId={job.id} />
        </aside>
      </div>
    </Page>
  );
}
