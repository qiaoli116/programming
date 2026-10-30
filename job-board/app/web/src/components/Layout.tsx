import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { Role } from '@jobboard/shared';
import { useAuth } from '../auth';
import { EmptyState, Loading, Page } from './ui';

const current = ({ isActive }: { isActive: boolean }) => (isActive ? 'current' : undefined);

/** The header from the mockups: it changes with who is signed in (UC-08, UC-09). */
export function Header() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const isEmployer = user?.role === 'employer';

  async function handleSignOut() {
    await signOut();
    navigate('/sign-in', { state: { signedOut: true } });
  }

  return (
    <header className="site-header">
      <div className="inner">
        <Link className="brand" to={isEmployer ? '/employer/jobs' : '/'}>
          Job<span>Board</span>
          {isEmployer && (
            <>
              {' '}
              <span className="chip grey" style={{ verticalAlign: 'middle' }}>
                Employer area
              </span>
            </>
          )}
        </Link>
        <nav aria-label="Main">
          {isEmployer ? (
            <NavLink to="/employer/jobs" className={current}>
              My job posts
            </NavLink>
          ) : (
            <>
              <NavLink to="/" end className={current}>
                Find jobs
              </NavLink>
              {user && (
                <NavLink to="/my-applications" className={current}>
                  My applications
                </NavLink>
              )}
            </>
          )}
        </nav>
        <div className="user">
          {user ? (
            <>
              <span className="who">{isEmployer ? user.companyName ?? user.name : user.name}</span>
              <span className="chip">{isEmployer ? 'Employer' : 'Seeker'}</span>
              <button className="btn secondary small" onClick={handleSignOut}>
                Sign out
              </button>
            </>
          ) : (
            <Link className="btn small" to="/sign-in">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

export function Layout() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Header />
      <Outlet />
    </>
  );
}

/** Wraps pages that need a signed-in person of a given role. */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading)
    return (
      <Page>
        <Loading />
      </Page>
    );
  if (!user) {
    return <Navigate to="/sign-in" replace state={{ from: location.pathname, notice: 'Please sign in to continue.' }} />;
  }
  if (user.role !== role) {
    return (
      <Page>
        {role === 'employer' ? (
          <EmptyState title="This area is for employer accounts">
            You are signed in as a job seeker. <Link to="/">Back to job search</Link>
          </EmptyState>
        ) : (
          <EmptyState title="This page is for job seeker accounts">
            You are signed in as an employer. <Link to="/employer/jobs">Back to my job posts</Link>
          </EmptyState>
        )}
      </Page>
    );
  }
  return <>{children}</>;
}
