import * as https from 'node:https';

const MAX_REDIRECTS = 5;

export interface HttpsOptions {
  headers?: Record<string, string>;
  timeout?: number;
}

/** Fetch text content from a URL with redirect following and timeout. */
export function httpsGetText(
  url: string,
  options: HttpsOptions = {},
  redirectCount = 0
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (redirectCount >= MAX_REDIRECTS) {
      reject(new Error(`Too many redirects (>${MAX_REDIRECTS}) for ${url}`));
      return;
    }
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'emdash-marketplace',
          Accept: '*/*',
          ...options.headers,
        },
      },
      (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const location = res.headers.location;
          if (location) {
            const resolved = new URL(location, url).href;
            httpsGetText(resolved, options, redirectCount + 1).then(resolve, reject);
            return;
          }
        }
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(data));
        res.on('error', reject);
      }
    );
    req.on('error', reject);
    req.setTimeout(options.timeout ?? 15000, () => {
      req.destroy(new Error('Request timed out'));
    });
  });
}

/** Fetch and parse JSON from a URL with redirect following and timeout. */
export function httpsGetJson(
  url: string,
  options: HttpsOptions = {},
  redirectCount = 0
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (redirectCount >= MAX_REDIRECTS) {
      reject(new Error(`Too many redirects (>${MAX_REDIRECTS}) for ${url}`));
      return;
    }
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'emdash-marketplace',
          Accept: 'application/json',
          ...options.headers,
        },
      },
      (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const location = res.headers.location;
          if (location) {
            const resolved = new URL(location, url).href;
            httpsGetJson(resolved, options, redirectCount + 1).then(resolve, reject);
            return;
          }
        }
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Invalid JSON from ${url}`));
          }
        });
        res.on('error', reject);
      }
    );
    req.on('error', reject);
    req.setTimeout(options.timeout ?? 15000, () => {
      req.destroy(new Error('Request timed out'));
    });
  });
}
