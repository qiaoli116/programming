// S-01 Home / search (UC-01)
import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { EmptyState, JobCard, Loading, Notice, Page } from '../components/ui';
import { plural } from '../format';
import { useLoad } from '../useLoad';

export function HomePage() {
  const [params, setParams] = useSearchParams();
  const keyword = params.get('keyword') ?? '';
  const location = params.get('location') ?? '';
  const [keywordInput, setKeywordInput] = useState(keyword);
  const [locationInput, setLocationInput] = useState(location);
  const { data: jobs, error, loading } = useLoad(() => api.searchJobs(keyword, location), [keyword, location]);

  function search(e: FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams();
    if (keywordInput.trim()) next.set('keyword', keywordInput.trim());
    if (locationInput.trim()) next.set('location', locationInput.trim());
    setParams(next);
  }

  const searching = Boolean(keyword || location);
  const what = [keyword && `“${keyword}”`, location && `in ${location}`].filter(Boolean).join(' ');

  return (
    <>
      <div className="search-band">
        <div className="inner">
          <h1>Find your next job</h1>
          <form className="search-form" onSubmit={search} role="search">
            <input
              type="text"
              aria-label="Keyword"
              placeholder="Job title, skill or company"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
            />
            <input
              type="text"
              aria-label="Location"
              placeholder="Location (city or state)"
              value={locationInput}
              onChange={(e) => setLocationInput(e.target.value)}
            />
            <button className="btn" type="submit">
              Search
            </button>
          </form>
        </div>
      </div>
      <Page>
        {error && <Notice kind="err">{error.message}</Notice>}
        {loading && !jobs && <Loading />}
        {jobs && (
          <>
            <div className="results-head">
              <h2 style={{ margin: 0 }}>{searching ? 'Search results' : 'All jobs'}</h2>
              <span className="muted">{plural(jobs.length, 'job')} found · newest first</span>
            </div>
            {jobs.length === 0 ? (
              <EmptyState title={`No jobs found for ${what}`}>
                Try a different keyword, or remove the location to search everywhere.
              </EmptyState>
            ) : (
              jobs.map((job) => <JobCard key={job.id} job={job} />)
            )}
          </>
        )}
      </Page>
    </>
  );
}
