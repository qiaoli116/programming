// S-01 Home / search (UC-01)
import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { Link } from 'react-router-dom';
import { MAX_JOBS_PER_SCORING } from '@jobboard/shared';
import { useAuth } from '../auth';
import { Disclaimer, EmptyState, JobCard, Loading, Notice, Page } from '../components/ui';
import { plural } from '../format';
import { sortJobs, useScores } from '../scores';
import { useLoad } from '../useLoad';

export function HomePage() {
  const [params, setParams] = useSearchParams();
  const keyword = params.get('keyword') ?? '';
  const location = params.get('location') ?? '';
  const [keywordInput, setKeywordInput] = useState(keyword);
  const [locationInput, setLocationInput] = useState(location);
  const { data: jobs, error, loading } = useLoad(() => api.searchJobs(keyword, location), [keyword, location]);
  const { user } = useAuth();
  const { scores, scoring, problem, sortByMatch, setSortByMatch, scoreJobs, clearProblem } = useScores();
  const isSeeker = user?.role === 'seeker';
  const anyScored = Boolean(jobs?.some((j) => scores[j.id]));
  const shown = jobs ? (sortByMatch && anyScored ? sortJobs(jobs, scores) : jobs) : null;

  function search(e: FormEvent) {
    e.preventDefault();
    clearProblem();
    setSortByMatch(false);
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
        {jobs && shown && (
          <>
            <div className="score-bar">
              <div>
                <h2 style={{ margin: 0 }}>{searching ? 'Search results' : 'All jobs'}</h2>
                <span className="muted">
                  {scoring
                    ? `Scoring ${plural(Math.min(jobs.length, MAX_JOBS_PER_SCORING), 'job')}…`
                    : `${plural(jobs.length, 'job')} found · ${sortByMatch && anyScored ? 'highest match first' : 'newest first'}`}
                </span>
              </div>
              {isSeeker && jobs.length > 0 && (
                <div className="actions">
                  {anyScored && !scoring && (
                    <button className="btn secondary" type="button" aria-pressed={sortByMatch} onClick={() => setSortByMatch(!sortByMatch)}>
                      {sortByMatch ? 'Sort by newest' : 'Sort by match'}
                    </button>
                  )}
                  <button className="btn" type="button" disabled={scoring} onClick={() => scoreJobs(jobs)}>
                    {scoring ? 'Scoring…' : anyScored ? 'Score again' : 'Score these results'}
                  </button>
                </div>
              )}
            </div>
            {isSeeker && jobs.length > 0 && <Disclaimer />}
            {isSeeker && jobs.length > MAX_JOBS_PER_SCORING && (
              <p className="small muted">Only the first {MAX_JOBS_PER_SCORING} results are scored. Narrow your search to score the rest.</p>
            )}
            {!user && jobs.length > 0 && (
              <Notice kind="info">
                <Link to="/sign-in" state={{ from: '/', notice: 'Sign in to score your results against your profile.' }}>
                  Sign in
                </Link>{' '}
                to score your results against your profile.
              </Notice>
            )}
            {problem === 'empty' && (
              <Notice kind="info">
                Your profile is empty. <Link to="/profile">Write your profile</Link> first, then score your results.
              </Notice>
            )}
            {problem === 'unavailable' && (
              <Notice kind="err">Scoring is not available right now. Your search results are unchanged. Try again in a moment.</Notice>
            )}
            {shown.length === 0 ? (
              <EmptyState title={`No jobs found for ${what}`}>
                Try a different keyword, or remove the location to search everywhere.
              </EmptyState>
            ) : (
              shown.map((job) => <JobCard key={job.id} job={job} score={scores[job.id]} scoring={scoring} />)
            )}
          </>
        )}
      </Page>
    </>
  );
}
