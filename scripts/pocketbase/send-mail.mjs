import fs from 'node:fs/promises';
import net from 'node:net';
import tls from 'node:tls';

const NEWLINE = '\r\n';
const SOCKET_TIMEOUT_MS = 30000;

function applySocketTimeout(socket) {
  socket.setTimeout(SOCKET_TIMEOUT_MS, () => {
    socket.destroy(new Error('SMTP connection timed out.'));
  });

  return socket;
}

function normalizeAddress(address) {
  if (!address || typeof address.address !== 'string') {
    return null;
  }

  const value = address.address.trim();
  if (!value) {
    return null;
  }

  return {
    address: value,
    name: typeof address.name === 'string' ? address.name.trim() : '',
  };
}

function normalizeAddressList(value) {
  return Array.isArray(value)
    ? value.map(normalizeAddress).filter(Boolean)
    : [];
}

function encodeHeader(value) {
  const text = String(value || '');
  if (!/[^\x20-\x7e]/.test(text)) {
    return text;
  }

  return '=?UTF-8?B?' + Buffer.from(text, 'utf8').toString('base64') + '?=';
}

function formatAddress(address) {
  const normalized = normalizeAddress(address);
  if (!normalized) {
    return '';
  }

  if (!normalized.name) {
    return '<' + normalized.address + '>';
  }

  return encodeHeader(normalized.name) + ' <' + normalized.address + '>';
}

function foldBase64(value) {
  return Buffer.from(String(value || ''), 'utf8')
    .toString('base64')
    .replace(/.{1,76}/g, '$&' + NEWLINE)
    .trimEnd();
}

function dotStuff(value) {
  return String(value || '')
    .replace(/\r?\n/g, NEWLINE)
    .split(NEWLINE)
    .map((line) => (line.startsWith('.') ? '.' + line : line))
    .join(NEWLINE);
}

function buildMessage(payload) {
  const message = payload.message || {};
  const from = normalizeAddress(message.from || payload.from);
  const to = normalizeAddressList(message.to);
  const cc = normalizeAddressList(message.cc);
  const bcc = normalizeAddressList(message.bcc);
  const text = String(message.text || '');
  const html = String(message.html || '');
  const boundary = 'pbmail_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);

  if (!from) {
    throw new Error('Missing mail sender address.');
  }
  if (to.length + cc.length + bcc.length === 0) {
    throw new Error('Missing mail recipients.');
  }

  const headers = [
    ['From', formatAddress(from)],
    ['To', to.map(formatAddress).join(', ')],
  ];

  if (cc.length) {
    headers.push(['Cc', cc.map(formatAddress).join(', ')]);
  }

  headers.push(
    ['Subject', encodeHeader(message.subject || '')],
    ['MIME-Version', '1.0'],
  );

  const customHeaders = message.headers && typeof message.headers === 'object' ? message.headers : {};
  for (const [key, value] of Object.entries(customHeaders)) {
    if (/^[A-Za-z0-9-]+$/.test(key) && value !== undefined && value !== null) {
      headers.push([key, String(value)]);
    }
  }

  let body = '';
  if (text && html) {
    headers.push(['Content-Type', 'multipart/alternative; boundary="' + boundary + '"']);
    body = [
      '--' + boundary,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      foldBase64(text),
      '--' + boundary,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      foldBase64(html),
      '--' + boundary + '--',
      '',
    ].join(NEWLINE);
  } else if (html) {
    headers.push(
      ['Content-Type', 'text/html; charset=UTF-8'],
      ['Content-Transfer-Encoding', 'base64'],
    );
    body = foldBase64(html);
  } else {
    headers.push(
      ['Content-Type', 'text/plain; charset=UTF-8'],
      ['Content-Transfer-Encoding', 'base64'],
    );
    body = foldBase64(text);
  }

  return {
    envelope: {
      from: from.address,
      recipients: [...to, ...cc, ...bcc].map((address) => address.address),
    },
    raw: headers
      .filter(([, value]) => value)
      .map(([key, value]) => key + ': ' + value)
      .join(NEWLINE) + NEWLINE + NEWLINE + body,
  };
}

function readLine(socket) {
  return new Promise((resolve, reject) => {
    let buffer = '';

    const cleanup = () => {
      socket.off('data', onData);
      socket.off('error', onError);
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onData = (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] || '';

      if (/^\d{3} /.test(last)) {
        cleanup();
        resolve(lines);
      }
    };

    socket.on('data', onData);
    socket.on('error', onError);
  });
}

async function expect(socket, allowedCodes) {
  const lines = await readLine(socket);
  const code = Number.parseInt(lines[lines.length - 1].slice(0, 3), 10);

  if (!allowedCodes.includes(code)) {
    throw new Error('SMTP command failed: ' + lines.join(' | '));
  }

  return lines;
}

async function command(socket, value, allowedCodes) {
  socket.write(value + NEWLINE);
  return expect(socket, allowedCodes);
}

function connectPlain(host, port) {
  return new Promise((resolve, reject) => {
    const socket = applySocketTimeout(net.createConnection({ host, port }, () => resolve(socket)));
    socket.once('error', reject);
  });
}

function connectTls(host, port, insecureSkipVerify) {
  return new Promise((resolve, reject) => {
    const socket = applySocketTimeout(tls.connect({
      host,
      port,
      servername: host,
      rejectUnauthorized: !insecureSkipVerify,
    }, () => resolve(socket)));
    socket.once('error', reject);
  });
}

function upgradeToTls(socket, host, insecureSkipVerify) {
  return new Promise((resolve, reject) => {
    const secureSocket = applySocketTimeout(tls.connect({
      socket,
      servername: host,
      rejectUnauthorized: !insecureSkipVerify,
    }, () => resolve(secureSocket)));
    secureSocket.once('error', reject);
  });
}

async function authenticate(socket, smtp) {
  const username = String(smtp.username || '');
  const password = String(smtp.password || '');

  if (!username && !password) {
    return;
  }

  if (String(smtp.authMethod || 'PLAIN').toUpperCase() === 'LOGIN') {
    await command(socket, 'AUTH LOGIN', [334]);
    await command(socket, Buffer.from(username, 'utf8').toString('base64'), [334]);
    await command(socket, Buffer.from(password, 'utf8').toString('base64'), [235]);
    return;
  }

  const token = Buffer.from('\0' + username + '\0' + password, 'utf8').toString('base64');
  await command(socket, 'AUTH PLAIN ' + token, [235]);
}

async function sendMail(payload) {
  const smtp = payload.smtp || {};
  const host = String(smtp.host || '').trim();
  const port = Number(smtp.port);
  const localName = String(smtp.localName || 'localhost').trim() || 'localhost';
  const { envelope, raw } = buildMessage(payload);

  if (!host || !Number.isInteger(port)) {
    throw new Error('Missing SMTP host or port.');
  }

  let socket = smtp.tls
    ? await connectTls(host, port, payload.insecureSkipVerify)
    : await connectPlain(host, port);

  try {
    await expect(socket, [220]);
    let ehloLines = await command(socket, 'EHLO ' + localName, [250]);

    if (!smtp.tls && ehloLines.some((line) => /^250[- ]STARTTLS$/i.test(line))) {
      await command(socket, 'STARTTLS', [220]);
      socket = await upgradeToTls(socket, host, payload.insecureSkipVerify);
      ehloLines = await command(socket, 'EHLO ' + localName, [250]);
    }

    await authenticate(socket, smtp);
    await command(socket, 'MAIL FROM:<' + envelope.from + '>', [250]);

    for (const recipient of envelope.recipients) {
      await command(socket, 'RCPT TO:<' + recipient + '>', [250, 251]);
    }

    await command(socket, 'DATA', [354]);
    socket.write(dotStuff(raw) + NEWLINE + '.' + NEWLINE);
    await expect(socket, [250]);
    await command(socket, 'QUIT', [221]);
  } finally {
    socket.end();
  }
}

async function main() {
  const payloadPath = process.argv[2];

  if (!payloadPath) {
    throw new Error('Usage: node scripts/pocketbase/send-mail.mjs <payload-json-path>');
  }

  const payload = JSON.parse(await fs.readFile(payloadPath, 'utf8'));
  await sendMail(payload);
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);

  const payloadPath = process.argv[2];
  if (payloadPath) {
    try {
      await fs.writeFile(payloadPath + '.err', message, 'utf8');
    } catch (_) {
      // best-effort
    }
  }

  process.exit(1);
});
