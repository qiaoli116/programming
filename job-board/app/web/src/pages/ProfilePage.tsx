// S-09 My profile (UC-10): one Markdown box with a live preview.
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { MAX_PROFILE_LENGTH } from '@jobboard/shared';
import { api, ApiRequestError } from '../api';
import { Disclaimer, Field, Loading, Notice, Page, errorProps } from '../components/ui';
import { formatDate } from '../format';
import { useLoad } from '../useLoad';

/** Markdown to safe HTML: anything that could run script is removed before it is shown. */
function renderMarkdown(source: string): string {
  return DOMPurify.sanitize(marked.parse(source, { async: false }) as string);
}

export function ProfilePage() {
  const { data: loaded, error: loadError, loading } = useLoad(() => api.getProfile(), []);
  const [body, setBody] = useState('');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (loaded) {
      setBody(loaded.body);
      setSavedAt(loaded.updatedAt);
    }
  }, [loaded]);

  const html = useMemo(() => renderMarkdown(body), [body]);
  const tooLong = body.length > MAX_PROFILE_LENGTH;

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    setError('');
    if (tooLong) {
      setError(`The profile can be at most ${MAX_PROFILE_LENGTH.toLocaleString('en-US')} characters (now ${body.length.toLocaleString('en-US')}).`);
      return;
    }
    setSaving(true);
    try {
      const profile = await api.saveProfile(body);
      setSavedAt(profile.updatedAt);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <Page>
        <Loading />
      </Page>
    );

  return (
    <Page>
      <div className="page-head">
        <div>
          <h1>My profile</h1>
          <p className="muted" style={{ margin: 0 }}>
            Write about your skills, experience and what you want. The more you write, the better the matches.
          </p>
        </div>
      </div>
      <Disclaimer />
      {loadError && <Notice kind="err">{loadError.message}</Notice>}
      {saved && <Notice kind="ok">Your profile has been saved.</Notice>}
      {error && <Notice kind="err">{error}</Notice>}
      <form onSubmit={save} noValidate>
        <div className="profile-grid">
          <Field
            id="profile"
            label="Profile (Markdown)"
            hint={`Plain text with Markdown headings and bullets. ${body.length.toLocaleString('en-US')} / ${MAX_PROFILE_LENGTH.toLocaleString('en-US')} characters.`}
            error={tooLong ? 'This profile is too long.' : undefined}
          >
            <textarea
              id="profile"
              className="profile"
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                setSaved(false);
              }}
              {...errorProps('profile', tooLong ? 'x' : undefined)}
            />
          </Field>
          <div>
            <label>Preview</label>
            <div className="card preview" data-testid="profile-preview" dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </div>
        <button className="btn" type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save profile'}
        </button>
        {savedAt && (
          <span className="muted small" style={{ marginLeft: 12 }}>
            Saved {formatDate(savedAt)}
          </span>
        )}
      </form>
    </Page>
  );
}
