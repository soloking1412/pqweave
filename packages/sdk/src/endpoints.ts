/**
 * Public endpoints rate-limit, go down and get retired without notice. Every
 * scanner that reads from one keeps an ordered list and moves to the next when a
 * read fails, so one dead provider does not fail the scan.
 */

const ATTEMPT_TIMEOUT_MS = 5_000;

async function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('endpoint timed out')), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Wrap a single-endpoint scan so it walks a list of defaults.
 *
 * A caller who names an endpoint gets exactly that endpoint: dedicated
 * infrastructure should fail loudly, not degrade to a public one.
 */
export function withEndpointFailover<K extends string, O extends { [P in K]?: string }, R>(
  scan: (address: string, options: O) => Promise<R>,
  key: K,
  defaults: readonly string[],
): (address: string, options?: O) => Promise<R> {
  return async (address, options = {} as O) => {
    if (options[key]) return scan(address, options);
    let last: unknown;
    for (const endpoint of defaults) {
      try {
        return await withDeadline(
          scan(address, { ...options, [key]: endpoint }),
          ATTEMPT_TIMEOUT_MS,
        );
      } catch (error) {
        last = error;
      }
    }
    throw last instanceof Error ? last : new Error('all endpoints failed');
  };
}
