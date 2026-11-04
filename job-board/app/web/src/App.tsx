import { Link, Route, Routes } from 'react-router-dom';
import { Layout, RequireRole } from './components/Layout';
import { EmptyState, Page } from './components/ui';
import { ApplyPage } from './pages/ApplyPage';
import { EmployerJobsPage } from './pages/EmployerJobsPage';
import { HomePage } from './pages/HomePage';
import { JobApplicationsPage } from './pages/JobApplicationsPage';
import { JobDetailPage } from './pages/JobDetailPage';
import { JobFormPage } from './pages/JobFormPage';
import { MyApplicationsPage } from './pages/MyApplicationsPage';
import { ProfilePage } from './pages/ProfilePage';
import { SignInPage } from './pages/SignInPage';

// Screens S-01 to S-08 from the Stage 2 design.
export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/jobs/:id" element={<JobDetailPage />} />
        <Route
          path="/jobs/:id/apply"
          element={
            <RequireRole role="seeker">
              <ApplyPage />
            </RequireRole>
          }
        />
        <Route
          path="/my-applications"
          element={
            <RequireRole role="seeker">
              <MyApplicationsPage />
            </RequireRole>
          }
        />
        <Route
          path="/profile"
          element={
            <RequireRole role="seeker">
              <ProfilePage />
            </RequireRole>
          }
        />
        <Route
          path="/employer/jobs"
          element={
            <RequireRole role="employer">
              <EmployerJobsPage />
            </RequireRole>
          }
        />
        <Route
          path="/employer/jobs/new"
          element={
            <RequireRole role="employer">
              <JobFormPage />
            </RequireRole>
          }
        />
        <Route
          path="/employer/jobs/:id/edit"
          element={
            <RequireRole role="employer">
              <JobFormPage />
            </RequireRole>
          }
        />
        <Route
          path="/employer/jobs/:id/applications"
          element={
            <RequireRole role="employer">
              <JobApplicationsPage />
            </RequireRole>
          }
        />
        <Route path="/sign-in" element={<SignInPage />} />
        <Route
          path="*"
          element={
            <Page>
              <EmptyState title="Page not found">
                <Link to="/">Back to job search</Link>
              </EmptyState>
            </Page>
          }
        />
      </Route>
    </Routes>
  );
}
