// S-07 Applications for a job (UC-07)
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { EmptyState, Loading, Notice, NotFoundCard, Page, TableScroll } from '../components/ui';
import { formatDate, plural } from '../format';
import { useLoad } from '../useLoad';

export function JobApplicationsPage() {
  const { id } = useParams();
  const { data, error, loading } = useLoad(() => api.jobApplications(id!), [id]);
  const [openId, setOpenId] = useState<number | null>(null);

  if (loading)
    return (
      <Page>
        <Loading />
      </Page>
    );
  if (error?.status === 404)
    return (
      <Page>
        <NotFoundCard />
      </Page>
    );
  if (error?.status === 403)
    return (
      <Page>
        <EmptyState title="You cannot view these applications">
          You can only see applications for your own job posts. <Link to="/employer/jobs">Back to my job posts</Link>
        </EmptyState>
      </Page>
    );
  if (error || !data)
    return (
      <Page>
        <Notice kind="err">{error?.message ?? 'Something went wrong.'}</Notice>
      </Page>
    );

  const { job, applications } = data;
  const open = applications.find((a) => a.id === openId);

  return (
    <Page>
      <div className="crumbs">
        <Link to="/employer/jobs">← Back to my job posts</Link>
      </div>
      <div className="page-head">
        <div>
          <h1>Applications</h1>
          <div>
            <b>{job.title}</b> · {job.company} · {job.location}
          </div>
        </div>
        <Link className="btn secondary" to={`/employer/jobs/${job.id}/edit`}>
          Edit this post
        </Link>
      </div>
      {applications.length === 0 ? (
        <EmptyState title="No applications yet">When job seekers apply, they will appear here.</EmptyState>
      ) : (
        <>
          <p className="muted">{plural(applications.length, 'application')}</p>
          <TableScroll>
            <table className="data">
              <thead>
                <tr>
                  <th>Applicant</th>
                  <th>Email</th>
                  <th>Date applied</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {applications.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <b>{a.applicantName}</b>
                    </td>
                    <td>{a.applicantEmail}</td>
                    <td>{formatDate(a.appliedAt)}</td>
                    <td className="actions">
                      <button className="btn secondary small" onClick={() => setOpenId(a.id === openId ? null : a.id)}>
                        {a.id === openId ? 'Hide' : 'View'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </>
      )}
      {open && (
        <div className="card" style={{ marginTop: 20, borderColor: 'var(--accent)' }} aria-live="polite">
          <div className="page-head" style={{ marginBottom: 6 }}>
            <h2 style={{ margin: 0 }}>{open.applicantName}</h2>
            <span className="muted small">Applied {formatDate(open.appliedAt)}</span>
          </div>
          <div className="meta">
            <span>✉ {open.applicantEmail}</span>
            {open.phone && <span>☎ {open.phone}</span>}
          </div>
          <h3 style={{ marginTop: 12 }}>Cover letter</h3>
          <p className="prewrap" style={{ margin: 0 }}>
            {open.coverLetter}
          </p>
        </div>
      )}
    </Page>
  );
}
