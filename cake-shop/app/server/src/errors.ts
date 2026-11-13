import type { Reason } from '@cakeshop/shared';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public reasons?: Reason[],
  ) {
    super(message);
  }
}

/** The assistant could not answer (provider down, bad reply). Routes turn it into a 502. */
export class AssistantFailure extends Error {}
