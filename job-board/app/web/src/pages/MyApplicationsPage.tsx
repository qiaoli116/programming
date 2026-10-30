// S-04 My applications (UC-04)
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { EmptyState, Loading, Notice, Page, TableScroll } from '../components/ui';
import { formatDate, plural } from '../format';
import { useLoad } from '../useLoad';

export function MyApplicationsPage() {
  const { user } = useAuth();
  const { data: applications, error, loading } = useLoad(() => api.myApplications(), []);

  return (
    <Page>
      <h1>My applications</h1>
      {loading && <Loading />}
      {error && <Notice kind="err">{error.message}</Notice>}
      {applications &&
        (applications.length === 0 ? (
          <EmptyState title="You have not applied for any jobs yet">
            <Link to="/">Search for jobs</Link> to find something to apply for.
          </EmptyState>
        ) : (
          <>
            <p className="muted">
              {plural(applications.length, 'application')} by <b>{user?.name}</b>
            </p>
            <TableScroll>
              <table className="data">
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Company</th>
                    <th>Date applied</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <Link to={`/jobs/${a.jobId}`}>
                          <b>{a.jobTitle}</b>
                        </Link>
                      </td>
                      <td>{a.company}</td>
                      <td>{formatDate(a.appliedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </>
        ))}
    </Page>
  );
}
