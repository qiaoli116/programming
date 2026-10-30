// S-03 Apply (UC-03)
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiRequestError, api } from '../api';
import { useAuth } from '../auth';
import { errorProps, Field, Loading, Notice, NotFoundCard, Page } from '../components/ui';
import { formatDate } from '../format';
import { useLoad } from '../useLoad';

export function ApplyPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data, error, loading } = useLoad(async () => ({ job: await api.getJob(id!), mine: await api.myApplications() }), [id]);

  const [phone, setPhone] = useState('');
  const [coverLetter, setCoverLetter] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [alreadyAppliedOn, setAlreadyAppliedOn] = useState<string | null>(null);

  if (loading)
    return (
      <Page>
        <Loading />
      </Page>
    );
  if (!data) {
    return (
      <Page>
        {error && error.status !== 404 ? <Notice kind="err">{error.message}</Notice> : <NotFoundCard />}
      </Page>
    );
  }

  const { job } = data;
  const existing = data.mine.find((a) => a.jobId === job.id);
  const appliedOn = alreadyAppliedOn ?? (existing && formatDate(existing.appliedAt));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMessage('');
    setBusy(true);
    try {
      await api.apply(job.id, { phone, coverLetter });
      setFieldErrors({});
      setSent(true);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 422) {
        // What the seeker typed stays in the form.
        setFieldErrors(err.fields);
        setMessage('Please fix the highlighted fields.');
      } else if (err instanceof ApiRequestError && err.status === 409) {
        const mine = await api.myApplications().catch(() => []);
        const found = mine.find((a) => a.jobId === job.id);
        setAlreadyAppliedOn(found ? formatDate(found.appliedAt) : 'an earlier date');
      } else {
        setMessage(err instanceof ApiRequestError ? err.message : 'Something went wrong. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <Page>
        <Notice kind="ok">
          <b>Your application has been sent.</b>
          <br />
          {job.title} at {job.company}.
        </Notice>
        <div className="button-row">
          <Link className="btn" to="/my-applications">
            View my applications
          </Link>
          <Link className="btn secondary" to="/">
            Keep searching
          </Link>
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <div className="crumbs">
        <Link to={`/jobs/${job.id}`}>← Back to job</Link>
      </div>
      <div className="card" style={{ background: 'var(--accent-soft)', borderColor: '#a7d7d2' }}>
        <span className="muted small">You are applying for</span>
        <h3 style={{ fontSize: '1.15rem' }}>
          {job.title} · {job.company}
        </h3>
        <span className="muted small">
          {job.location} · {job.workType}
        </span>
      </div>

      {appliedOn ? (
        <Notice kind="info">
          <b>You have already applied for this job</b> on {appliedOn}. <Link to="/my-applications">View my applications</Link>
        </Notice>
      ) : (
        <div className="card">
          <h1>Your application</h1>
          <p className="muted" style={{ marginBottom: 14 }}>
            Applying as <b>{user?.name}</b> · {user?.email} <span className="small">(from your account)</span>
          </p>
          {message && (
            <Notice kind="err">
              <b>{message}</b>
            </Notice>
          )}
          <form onSubmit={submit} noValidate>
            <Field id="phone" label="Phone" optional error={fieldErrors.phone}>
              <input
                id="phone"
                type="tel"
                placeholder="e.g. 0400 000 000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                {...errorProps('phone', fieldErrors.phone)}
              />
            </Field>
            <Field id="coverLetter" label="Cover letter" required error={fieldErrors.coverLetter}>
              <textarea
                id="coverLetter"
                placeholder="Tell the employer why you are a good fit."
                value={coverLetter}
                onChange={(e) => setCoverLetter(e.target.value)}
                {...errorProps('coverLetter', fieldErrors.coverLetter)}
              />
            </Field>
            <div className="button-row">
              <button className="btn" type="submit" disabled={busy}>
                Send application
              </button>
              <Link className="btn secondary" to={`/jobs/${job.id}`}>
                Cancel
              </Link>
            </div>
          </form>
        </div>
      )}
    </Page>
  );
}
