// S-05 My job posts (start of UC-05, UC-06, UC-07)
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { EmptyState, Loading, Notice, Page, TableScroll } from '../components/ui';
import { plural, timeAgo } from '../format';
import { useLoad } from '../useLoad';

export function EmployerJobsPage() {
  const { user } = useAuth();
  const flash = (useLocation().state as { flash?: string } | null)?.flash;
  const { data: jobs, error, loading } = useLoad(() => api.employerJobs(), []);

  return (
    <Page>
      {flash && (
        <Notice kind="ok">
          <b>{flash}</b>
        </Notice>
      )}
      <div className="page-head">
        <div>
          <h1>My job posts</h1>
          <div className="muted">
            {user?.companyName}
            {jobs && ` · ${plural(jobs.length, 'post')}`}
          </div>
        </div>
        <Link className="btn" to="/employer/jobs/new">
          + Post a job
        </Link>
      </div>
      {loading && <Loading />}
      {error && <Notice kind="err">{error.message}</Notice>}
      {jobs &&
        (jobs.length === 0 ? (
          <EmptyState title="No job posts yet">
            Post your first job so seekers can find it.
            <br />
            <br />
            <Link className="btn" to="/employer/jobs/new">
              + Post a job
            </Link>
          </EmptyState>
        ) : (
          <TableScroll>
            <table className="data">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Location</th>
                  <th>Posted</th>
                  <th>Applications</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td>
                      <Link to={`/jobs/${job.id}`}>
                        <b>{job.title}</b>
                      </Link>
                    </td>
                    <td>{job.location}</td>
                    <td>{timeAgo(job.postedAt)}</td>
                    <td>
                      <Link to={`/employer/jobs/${job.id}/applications`}>{plural(job.applicationCount, 'application')}</Link>
                    </td>
                    <td className="actions">
                      <Link className="btn secondary small" to={`/employer/jobs/${job.id}/edit`}>
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        ))}
    </Page>
  );
}
