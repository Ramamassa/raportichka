export async function getBody(req, limit = 5_000_000) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') return req.body;
    if (Buffer.isBuffer(req.body)) return req.body;
    return JSON.stringify(req.body);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('Payload too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function sendJson(res, statusCode, data) {
  if (typeof res.status === 'function') {
    return res.status(statusCode).json(data);
  }
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(data));
}
