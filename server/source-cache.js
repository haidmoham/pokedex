// Cache successful JSON only. Share pending reads so simultaneous pages do not
// multiply requests, and leave failures uncached for an explicit page retry.
export function createSourceCache({
  fetcher = fetch,
  now = Date.now,
  ttlMs = 30 * 60 * 1000,
  maxEntries = 1000,
  timeoutMs = 6000,
  attempts = 2,
  backoffMs = 150,
  delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
} = {}) {
  const cache = new Map();
  const pending = new Map();

  async function fetchJson(url) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      const controller = new AbortController();
      let timer;
      try {
        // The deadline covers the body as well as response headers. The race
        // also bounds fetch implementations that do not honor AbortSignal.
        return await Promise.race([
          (async () => {
            const response = await fetcher(url, { signal: controller.signal });
            if (!response.ok) {
              const error = new Error(`source returned ${response.status}`);
              error.retryable = [408, 425, 429].includes(response.status) || response.status >= 500;
              throw error;
            }
            return response.json();
          })(),
          new Promise((_, reject) => {
            timer = setTimeout(() => {
              controller.abort();
              reject(new Error('source request timed out'));
            }, timeoutMs);
          }),
        ]);
      } catch (error) {
        if (error.retryable === false || attempt + 1 >= attempts) throw error;
      } finally {
        clearTimeout(timer);
      }
      await delay(backoffMs * (attempt + 1));
    }
    throw new Error('source request failed');
  }

  return function cachedJson(url, schedule = task => task(), validate = value => value) {
    const hit = cache.get(url);
    if (hit && now() - hit.time < ttlMs) return Promise.resolve(hit.value);
    if (pending.has(url)) return pending.get(url);
    const task = Promise.resolve()
      .then(() => schedule(() => fetchJson(url)))
      .then(validate)
      .then(value => {
        // Refresh insertion order and cap memory without retaining failures.
        cache.delete(url);
        if (cache.size >= maxEntries) cache.delete(cache.keys().next().value);
        cache.set(url, { time: now(), value });
        return value;
      })
      .finally(() => pending.delete(url));
    pending.set(url, task);
    return task;
  };
}

// Shared across pages of one discovery service, including simultaneous artists.
export function createConcurrencyLimit(maximum) {
  let active = 0;
  const waiting = [];
  return async function schedule(task) {
    if (active >= maximum) await new Promise(resolve => waiting.push(resolve));
    else active++;
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}
