// S-06 Post / edit a job (UC-05, UC-06): one form, two modes
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { WORK_TYPES, type Job, type JobForm, type WorkType } from '@jobboard/shared';
import { ApiRequestError, api } from '../api';
import { useAuth } from '../auth';
import { EmptyState, errorProps, Field, Loading, Notice, NotFoundCard, Page } from '../components/ui';
import { useLoad } from '../useLoad';

function JobFormView({ job }: { job?: Job }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const editing = Boolean(job);
  const [title, setTitle] = useState(job?.title ?? '');
  const [location, setLocation] = useState(job?.location ?? '');
  const [workType, setWorkType] = useState<WorkType>(job?.workType ?? 'Full-time');
  const [salary, setSalary] = useState(job?.salary ?? '');
  const [description, setDescription] = useState(job?.description ?? '');
  const [requirements, setRequirements] = useState(job?.requirements ?? '');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMessage('');
    setBusy(true);
    const form: JobForm = { title, location, workType, salary, description, requirements };
    try {
      if (job) await api.updateJob(job.id, form);
      else await api.createJob(form);
      navigate('/employer/jobs', { state: { flash: editing ? 'Your changes have been saved.' : 'Your job has been published.' } });
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 422) {
        setFieldErrors(err.fields);
        setMessage('Please fix the highlighted fields. Nothing has been saved.');
      } else {
        setMessage(err instanceof ApiRequestError ? err.message : 'Something went wrong. Please try again.');
      }
      setBusy(false);
    }
  }

  return (
    <Page>
      <div className="crumbs">
        <Link to="/employer/jobs">← Back to my job posts</Link>
      </div>
      <div className="card">
        <h1>{editing ? 'Edit job post' : 'Post a job'}</h1>
        {editing && <p className="muted">Changes appear straight away for job seekers. Applications already received are kept.</p>}
        {message && (
          <Notice kind="err">
            <b>{message}</b>
          </Notice>
        )}
        <form onSubmit={submit} noValidate>
          <Field id="title" label="Job title" required error={fieldErrors.title}>
            <input
              id="title"
              type="text"
              placeholder="e.g. Frontend Developer"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              {...errorProps('title', fieldErrors.title)}
            />
          </Field>
          <div className="row2">
            <Field id="company" label="Company" hint="Taken from your employer account.">
              <input id="company" type="text" value={user?.companyName ?? ''} disabled />
            </Field>
            <Field id="location" label="Location" required error={fieldErrors.location}>
              <input
                id="location"
                type="text"
                placeholder="e.g. Melbourne VIC"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                {...errorProps('location', fieldErrors.location)}
              />
            </Field>
          </div>
          <div className="row2">
            <Field id="workType" label="Work type" required error={fieldErrors.workType}>
              <select
                id="workType"
                value={workType}
                onChange={(e) => setWorkType(e.target.value as WorkType)}
                {...errorProps('workType', fieldErrors.workType)}
              >
                {WORK_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field id="salary" label="Salary" optional error={fieldErrors.salary}>
              <input
                id="salary"
                type="text"
                placeholder="e.g. $80k – $95k"
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
                {...errorProps('salary', fieldErrors.salary)}
              />
            </Field>
          </div>
          <Field id="description" label="Description" required error={fieldErrors.description}>
            <textarea
              id="description"
              placeholder="What is the role and the team like?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              {...errorProps('description', fieldErrors.description)}
            />
          </Field>
          <Field id="requirements" label="Requirements" required hint="One requirement per line." error={fieldErrors.requirements}>
            <textarea
              id="requirements"
              placeholder="Skills and experience needed."
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
              {...errorProps('requirements', fieldErrors.requirements)}
            />
          </Field>
          <div className="button-row">
            <button className="btn" type="submit" disabled={busy}>
              {editing ? 'Save changes' : 'Publish job'}
            </button>
            <Link className="btn secondary" to="/employer/jobs">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </Page>
  );
}

export function JobFormPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data: job, error, loading } = useLoad(() => (id ? api.getJob(id) : Promise.resolve(null)), [id]);

  if (!id) return <JobFormView />;
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
  if (error || !job)
    return (
      <Page>
        <Notice kind="err">{error?.message ?? 'Something went wrong.'}</Notice>
      </Page>
    );
  if (job.ownerId !== user?.id) {
    return (
      <Page>
        <EmptyState title="You cannot edit this post">
          You can only edit your own job posts. <Link to="/employer/jobs">Back to my job posts</Link>
        </EmptyState>
      </Page>
    );
  }
  return <JobFormView job={job} />;
}
