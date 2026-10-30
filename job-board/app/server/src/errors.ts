export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const unauthorized = () => new HttpError(401, 'UNAUTHORIZED', 'Please sign in to continue.');
export const forbidden = (message = 'You are not allowed to do that.') => new HttpError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Not found.') => new HttpError(404, 'NOT_FOUND', message);
export const invalid = (fields: Record<string, string>) =>
  new HttpError(422, 'VALIDATION', 'Please fix the highlighted fields.', fields);
