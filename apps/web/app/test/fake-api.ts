import type { AppLoadContext } from 'react-router';

type Handler = (request: Request) => Response | Promise<Response>;

/** Fake `API` service binding: every request goes to `handler`, and all requests are recorded. */
export function fakeApi(handler: Handler) {
  const requests: Request[] = [];
  const binding = {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push(request.clone() as Request);
      return handler(request);
    },
  } as unknown as Fetcher;
  const context = { cloudflare: { env: { API: binding } } } as unknown as AppLoadContext;
  return { context, requests };
}

export const json = (body: unknown, status = 200) => Response.json(body, { status });
