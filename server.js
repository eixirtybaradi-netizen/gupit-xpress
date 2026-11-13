const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'site-data.json');
const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 30 * 1024 * 1024;
const sessions = new Map();

if (!ADMIN_PASSCODE) {
  console.error('Set ADMIN_PASSCODE before starting the server.');
  process.exit(1);
}

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ bookings: [], reviews: [] }, null, 2));
}

function loadStore() {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  return {
    bookings: Array.isArray(data.bookings) ? data.bookings : [],
    reviews: Array.isArray(data.reviews) ? data.reviews : [],
    gallery: Array.isArray(data.gallery) ? data.gallery : []
  };
}

let store = loadStore();

function saveStore() {
  const temporaryFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(store, null, 2));
  fs.renameSync(temporaryFile, DATA_FILE);
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
      const error = new Error('Request is too large.');
      error.status = 413;
      throw error;
    }
  }
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    const error = new Error('Invalid JSON request.');
    error.status = 400;
    throw error;
  }
}

function authorized(request) {
  const token = (request.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const expiresAt = sessions.get(token);
  if (!expiresAt || expiresAt <= Date.now()) {
    sessions.delete(token);
    return false;
  }
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return true;
}

function bookingSlots(date) {
  return store.bookings
    .filter(booking => booking.date === date && !booking.served)
    .map(booking => booking.time);
}

function validString(value, maxLength) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength;
}

function sendFile(request, response, pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    sendJson(response, 400, { error: 'Invalid path.' });
    return;
  }
  const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
  if (relativePath.includes('..') || !(relativePath === 'index.html' || relativePath === 'script.js' || relativePath === 'style.css' || relativePath.startsWith('assets/'))) {
    sendJson(response, 404, { error: 'Not found.' });
    return;
  }
  const filePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    sendJson(response, 404, { error: 'Not found.' });
    return;
  }
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml'
  };
  response.writeHead(200, {
    'Content-Type': types[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-cache'
  });
  if (request.method === 'HEAD') response.end();
  else fs.createReadStream(filePath).pipe(response);
}

async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (pathname === '/api/health' && request.method === 'GET') {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (pathname === '/api/admin/login' && request.method === 'POST') {
    const body = await readJson(request);
    const received = Buffer.from(String(body.passcode || ''));
    const expected = Buffer.from(ADMIN_PASSCODE);
    if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
      sendJson(response, 401, { error: 'That admin passcode is not correct.' });
      return;
    }
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, Date.now() + SESSION_TTL_MS);
    sendJson(response, 200, { token });
    return;
  }

  if (pathname === '/api/booked-slots' && request.method === 'GET') {
    const date = url.searchParams.get('date') || '';
    sendJson(response, 200, { times: bookingSlots(date) });
    return;
  }

  if (pathname === '/api/bookings' && request.method === 'POST') {
    const body = await readJson(request);
    if (!validString(body.name, 120) || !validString(body.phone, 40) || !/^\d{4}-\d{2}-\d{2}$/.test(body.date) || !validString(body.time, 20) || !validString(body.service, 60) || !validString(body.barber, 120)) {
      sendJson(response, 400, { error: 'Please provide valid booking details.' });
      return;
    }
    if (bookingSlots(body.date).includes(body.time)) {
      sendJson(response, 409, { error: 'That time is already booked. Please choose another slot.' });
      return;
    }
    const queueNum = store.bookings.reduce((highest, booking) => Math.max(highest, Number(booking.queueNum) || 0), 0) + 1;
    const booking = {
      id: crypto.randomUUID(),
      name: body.name.trim(),
      phone: body.phone.trim(),
      date: body.date,
      time: body.time,
      service: body.service.trim(),
      barber: body.barber.trim(),
      payment: body.payment === 'GCash' ? 'GCash' : 'Cash',
      amount: 120,
      receipt: typeof body.receipt === 'string' && body.receipt.startsWith('data:image/') ? body.receipt : '',
      queueNum,
      served: false,
      createdAt: new Date().toISOString()
    };
    store.bookings.push(booking);
    saveStore();
    sendJson(response, 201, booking);
    return;
  }

  if (pathname === '/api/reviews' && request.method === 'GET') {
    const reviews = store.reviews.slice().sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    sendJson(response, 200, { reviews });
    return;
  }

  if (pathname === '/api/reviews' && request.method === 'POST') {
    const body = await readJson(request);
    if (!validString(body.message, 1000) || !Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5 || (body.name && !validString(body.name, 120))) {
      sendJson(response, 400, { error: 'Please add a name, rating, and review within the allowed length.' });
      return;
    }
    const review = {
      id: crypto.randomUUID(),
      name: String(body.name || 'Anonymous').trim(),
      message: body.message.trim(),
      rating: body.rating,
      haircut: typeof body.haircut === 'string' ? body.haircut.slice(0, 60) : '',
      barber: typeof body.barber === 'string' ? body.barber.slice(0, 120) : '',
      createdAt: new Date().toISOString()
    };
    store.reviews.push(review);
    saveStore();
    sendJson(response, 201, { review });
    return;
  }

  if (pathname === '/api/gallery' && request.method === 'GET') {
    const posts = store.gallery || [];
    sendJson(response, 200, { posts: posts.slice().sort((left, right) => right.createdAt.localeCompare(left.createdAt)) });
    return;
  }

  if (pathname.startsWith('/api/admin/')) {
    if (!authorized(request)) {
      sendJson(response, 401, { error: 'Your admin session has expired. Please sign in again.' });
      return;
    }
    if (pathname === '/api/admin/bookings' && request.method === 'GET') {
      const bookings = store.bookings.slice().sort((left, right) => Number(left.queueNum) - Number(right.queueNum));
      sendJson(response, 200, { bookings });
      return;
    }
    if (pathname === '/api/admin/gallery' && request.method === 'POST') {
      const body = await readJson(request);
      const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']);
      const isVideo = typeof body.mediaType === 'string' && body.mediaType.startsWith('video/');
      const expectedType = isVideo ? 'video' : 'image';
      const dataPrefix = `data:${body.mediaType};base64,`;
      if (!allowedTypes.has(body.mediaType) || body.type !== expectedType || typeof body.mediaData !== 'string' || !body.mediaData.startsWith(dataPrefix) || body.mediaData.length > 28 * 1024 * 1024 || typeof body.caption !== 'string' || body.caption.length > 2200) {
        sendJson(response, 400, { error: 'Choose a supported photo or video and a caption under 2,200 characters.' });
        return;
      }
      const post = {
        id: crypto.randomUUID(),
        type: body.type,
        mediaType: body.mediaType,
        mediaData: body.mediaData,
        caption: body.caption.trim(),
        createdAt: new Date().toISOString()
      };
      store.gallery ||= [];
      store.gallery.push(post);
      saveStore();
      sendJson(response, 201, { post });
      return;
    }
    const galleryDeleteMatch = pathname.match(/^\/api\/admin\/gallery\/([^/]+)$/);
    if (galleryDeleteMatch && request.method === 'DELETE') {
      store.gallery ||= [];
      const index = store.gallery.findIndex(post => post.id === galleryDeleteMatch[1]);
      if (index < 0) {
        sendJson(response, 404, { error: 'Gallery post not found.' });
        return;
      }
      store.gallery.splice(index, 1);
      saveStore();
      sendJson(response, 200, { deleted: true });
      return;
    }
    if (pathname === '/api/admin/bookings' && request.method === 'DELETE') {
      const period = url.searchParams.get('period');
      const days = period === 'week' ? 7 : period === 'month' ? 30 : 0;
      if (!days) {
        sendJson(response, 400, { error: 'Choose a valid record period.' });
        return;
      }
      const threshold = Date.now() - days * 24 * 60 * 60 * 1000;
      const originalCount = store.bookings.length;
      store.bookings = store.bookings.filter(booking => !booking.createdAt || Date.parse(booking.createdAt) < threshold);
      const deleted = originalCount - store.bookings.length;
      saveStore();
      sendJson(response, 200, { deleted });
      return;
    }
    const serveMatch = pathname.match(/^\/api\/admin\/bookings\/([^/]+)\/serve$/);
    if (serveMatch && request.method === 'POST') {
      const booking = store.bookings.find(item => item.id === serveMatch[1]);
      if (!booking) {
        sendJson(response, 404, { error: 'Customer record not found.' });
        return;
      }
      booking.served = true;
      saveStore();
      sendJson(response, 200, { booking });
      return;
    }
    const deleteMatch = pathname.match(/^\/api\/admin\/bookings\/([^/]+)$/);
    if (deleteMatch && request.method === 'DELETE') {
      const index = store.bookings.findIndex(item => item.id === deleteMatch[1]);
      if (index < 0) {
        sendJson(response, 404, { error: 'Customer record not found.' });
        return;
      }
      store.bookings.splice(index, 1);
      saveStore();
      sendJson(response, 200, { deleted: true });
      return;
    }
  }

  if (pathname.startsWith('/api/')) {
    sendJson(response, 404, { error: 'API route not found.' });
    return;
  }

  if (request.method === 'GET' || request.method === 'HEAD') {
    sendFile(request, response, pathname);
    return;
  }
  sendJson(response, 405, { error: 'Method not allowed.' });
}

const server = http.createServer((request, response) => {
  handleRequest(request, response).catch(error => {
    if (!response.headersSent) sendJson(response, error.status || 500, { error: error.status ? error.message : 'The server could not complete that request.' });
    if (!error.status) console.error(error);
  });
});

server.listen(PORT, () => {
  console.log(`Gupit Xpress is running at http://127.0.0.1:${PORT}`);
});
