import { writeFileSync } from 'node:fs';

const tracePath = process.env.LINC_BENCHMARK_TRACE_FILE;
const originalFetch = globalThis.fetch;
const methods = new Map();
const statuses = new Map();
let requestCount = 0;
let requestBytes = 0;
let responseBytes = 0;
let failedRequests = 0;

function byteLength(value) {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'string') return Buffer.byteLength(value);
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  return 0;
}

function requestMethod(input, init) {
  return String(init?.method ?? input?.method ?? 'GET').toUpperCase();
}

function requestBody(input, init) {
  const body = init?.body ?? input?.body;
  const headers = new Headers(init?.headers ?? input?.headers);
  const contentLength = headers.get('content-length');
  const declared = contentLength === null ? NaN : Number(contentLength);
  return Number.isFinite(declared) && declared >= 0
    ? declared
    : byteLength(body);
}

function countResponseBody(response) {
  const contentLength = response.headers.get('content-length');
  const declared = contentLength === null ? NaN : Number(contentLength);
  if (Number.isFinite(declared) && declared >= 0) {
    responseBytes += declared;
    return response;
  }
  if (!response.body) return response;
  const reader = response.body.getReader();
  let bytes = 0;
  const body = new ReadableStream({
    async pull(controller) {
      try {
        const result = await reader.read();
        if (result.done) {
          responseBytes += bytes;
          controller.close();
        } else {
          bytes += result.value.byteLength;
          controller.enqueue(result.value);
        }
      } catch (error) {
        controller.error(error);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

globalThis.fetch = async function tracedFetch(input, init) {
  const method = requestMethod(input, init);
  try {
    const response = await originalFetch(input, init);
    requestCount += 1;
    requestBytes += requestBody(input, init);
    methods.set(method, (methods.get(method) ?? 0) + 1);
    const status = String(response.status);
    statuses.set(status, (statuses.get(status) ?? 0) + 1);
    return countResponseBody(response);
  } catch (error) {
    failedRequests += 1;
    throw error;
  }
};

function sortedObject(values) {
  return Object.fromEntries(
    [...values.entries()].sort(([a], [b]) => a.localeCompare(b)),
  );
}

process.once('exit', () => {
  if (!tracePath) return;
  try {
    writeFileSync(
      tracePath,
      `${JSON.stringify({
        requestCount,
        failedRequests,
        requestBodyBytes: requestBytes,
        responseBodyBytes: responseBytes,
        totalBodyBytes: requestBytes + responseBytes,
        requestsByMethod: sortedObject(methods),
        responsesByStatus: sortedObject(statuses),
      })}\n`,
      'utf8',
    );
  } catch {}
});
