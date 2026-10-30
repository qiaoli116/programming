// Server-side input checks (SEC-6): the browser checks too, but the server never trusts it.
import { WORK_TYPES, type ApplicationForm, type JobForm, type WorkType } from '@jobboard/shared';
import { invalid } from '../errors';

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const LIMITS = { title: 120, location: 80, salary: 60, description: 5000, requirements: 5000, phone: 30, coverLetter: 5000 };

export function validateJobForm(input: any): Required<Omit<JobForm, 'salary'>> & { salary: string | null } {
  const form = {
    title: text(input?.title),
    location: text(input?.location),
    workType: text(input?.workType) as WorkType,
    salary: text(input?.salary),
    description: text(input?.description),
    requirements: text(input?.requirements),
  };
  const errors: Record<string, string> = {};
  if (!form.title) errors.title = 'Job title is required.';
  else if (form.title.length > LIMITS.title) errors.title = `Keep the title under ${LIMITS.title} characters.`;
  if (!form.location) errors.location = 'Location is required.';
  else if (form.location.length > LIMITS.location) errors.location = `Keep the location under ${LIMITS.location} characters.`;
  if (!WORK_TYPES.includes(form.workType)) errors.workType = 'Choose a work type.';
  if (form.salary.length > LIMITS.salary) errors.salary = `Keep the salary under ${LIMITS.salary} characters.`;
  if (!form.description) errors.description = 'Please describe the role.';
  else if (form.description.length > LIMITS.description) errors.description = 'The description is too long.';
  if (!form.requirements) errors.requirements = 'Please list the requirements.';
  else if (form.requirements.length > LIMITS.requirements) errors.requirements = 'The requirements are too long.';
  if (Object.keys(errors).length) throw invalid(errors);
  return { ...form, salary: form.salary || null };
}

export function validateApplicationForm(input: any): { phone: string | null; coverLetter: string } {
  const phone = text(input?.phone);
  const coverLetter = text(input?.coverLetter);
  const errors: Record<string, string> = {};
  if (!coverLetter) errors.coverLetter = 'Please write a short cover letter.';
  else if (coverLetter.length > LIMITS.coverLetter) errors.coverLetter = 'The cover letter is too long.';
  if (phone.length > LIMITS.phone) errors.phone = 'That phone number is too long.';
  if (Object.keys(errors).length) throw invalid(errors);
  return { phone: phone || null, coverLetter };
}

export type { ApplicationForm };
