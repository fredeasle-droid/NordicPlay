import WebSocket from 'ws';
import { decode } from '@msgpack/msgpack';
import { zstdDecompressSync } from 'node:zlib';

const url = process.env.BETHERO_WS_URL ||
  'wss://ws-prematch.betherosports.com/surebets?format=msgpack&compress=zstd&pin=1&formulas=2&view=1&sort=event-asc&rows=30&touch=1';

let count = 0;
let finished = false;
const ws = new WebSocket(url, {
  handshakeTimeout: 10000,
  headers: { 'User-Agent': 'BetHero-Isolated-Test/0.1' }
});

function preview(value) {
  try {
    return (JSON.stringify(value, (_k, v) => typeof v === 'bigint' ? v.toString() : v) ?? String(value)).slice(0, 700);
  } catch {
    return '[decoded value; preview unavailable]';
  }
}

ws.on('open', () => {
  console.log('CONNECTED: WebSocket handshake succeeded.');
  console.log('Waiting up to 60 seconds for frames; no data is sent to any server.');
  setTimeout(() => {
    if (!finished) {
      console.log(`TIME LIMIT: received ${count} frame(s).`);
      finished = true;
      ws.close();
    }
  }, 60000).unref();
});

ws.on('message', (data, isBinary) => {
  count++;
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  console.log(`FRAME #${count}: ${isBinary ? 'binary' : 'text'}, ${buf.length} bytes`);
  if (!isBinary) {
    console.log(buf.toString('utf8').slice(0, 700));
    return;
  }

  try {
    console.log('DECODED AS ZSTD + MSGPACK:', preview(decode(zstdDecompressSync(buf))));
  } catch {
    try {
      console.log('DECODED AS MSGPACK:', preview(decode(buf)));
    } catch {
      console.log('Binary frame received, but decoding failed; the frame envelope may differ.');
    }
  }
});

ws.on('unexpected-response', (_request, response) => {
  console.error(`HANDSHAKE REJECTED: HTTP ${response.statusCode}.`);
  console.error('If this is 401/403, do not bypass it; use authorized access or an official API.');
  response.resume();
  finished = true;
});

ws.on('error', error => console.error('CONNECTION ERROR:', error.message));
ws.on('close', (code, reason) => {
  finished = true;
  console.log(`CLOSED: code=${code}, reason=${reason?.toString() || '(none)'}, frames=${count}`);
});
