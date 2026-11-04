import { MAX_CRITERIA, type Job } from '@jobboard/shared';

/** Builds the text sent to the AI for one job: instructions, then the posting, then the profile. */
export function buildPrompt(job: Pick<Job, 'title' | 'description' | 'requirements'>, profile: string): string {
  return `You help a job seeker judge how well they fit a job posting.

Read the posting and write at most ${MAX_CRITERIA} criteria that the posting itself asks for. Do not pad the list: if the posting supports fewer, or none, return fewer, or an empty list. Do not invent criteria the posting does not mention.

For each criterion, compare it with the seeker's profile and give:
- "criterion": the criterion, in your own short words
- "level": one of "Meets" (the profile clearly shows it), "Partly" (the profile shows some of it or something close), "Does not meet" (the profile shows it is missing), "Unknown" (the profile says nothing either way)
- "reason": one line quoting the profile evidence, or saying the profile is silent

Use only what is written in the profile. Never guess. If the profile is silent, the level is "Unknown".

=== POSTING ===
Title: ${job.title}
Description:
${job.description}
Requirements:
${job.requirements}
=== PROFILE ===
${profile}`;
}
