// Dependencies
const proxy = require('http-proxy');
const https = require('https');
const http = require('http');
const assert = require('assert');
const zlib = require('zlib');
const { URL } = require('url');

// Manual constants
const ALLOWED_METHODS = http.METHODS;
const ALLOWED_PROTOS = ['http', 'https'];
const DEFAULT_PROTO = 'https';
const DEFAULT_USERAGENT = 'Mozilla';

const getHosts = (hosts) => {
  if (!hosts) {
    return [];
  }
  let parsed = [];
  hosts = hosts.split(',');
  for (let i = 0; i < hosts.length; i++) {
    const iHost = hosts[i];
    const split = iHost.split(':');
    if (split.length !== 2) {
      throw new Error(`Configuration error! Invalid protocol:host pair on item ${iHost}`);
    }
    const proto = split[0];
    if (!ALLOWED_PROTOS.includes(proto)) {
      throw new Error(`Configuration error! Invalid protocol ${proto}. Only these protocols are allowed: ${ALLOWED_PROTOS.join(', ')}`);
    }
    const host = split[1];
    try {
      (() => new URL(`${proto}://${host}`))();
    } catch (e) {
      throw new Error(`Configuration error! Invalid host domain on item ${iHost}`);
    }
    parsed.push({
      proto: proto,
      host: host
    });
  }
  return parsed;
};

// Environment Constants
const PORT = process.env.PORT || 80;
const ACCESS_KEY = process.env.ACCESS_KEY;
const USE_WHITELIST = process.env.USE_WHITELIST === 'true';
const USE_OVERRIDE_STATUS = process.env.USE_OVERRIDE_STATUS === 'true';
const REWRITE_ACCEPT_ENCODING = process.env.REWRITE_ACCEPT_ENCODING === 'true';
const APPEND_HEAD = process.env.APPEND_HEAD === 'true';
const ALLOW_OVERRIDE_METHOD = process.env.ALLOW_OVERRIDE_METHOD === 'true';
const ALLOWED_HOSTS = getHosts(process.env.ALLOWED_HOSTS);

assert.ok(ACCESS_KEY);

const server = http.createServer();

const httpsProxy = proxy.createProxyServer({
  agent: new https.Agent({
    checkServerIdentity: (host, cert) => {
      return undefined;
    }
  }),
  changeOrigin: true
});

const httpProxy = proxy.createProxyServer({
  changeOrigin: true
});

const writeErr = (res, status, message) => {
  res.writeHead(status, {'Content-Type': 'text/plain'});
  res.end(message);
};

const onProxyError = (err, req, res) => {
  console.error(err);

  writeErr(res, 500, 'Proxying failed');
};

const onProxyReq = (proxyReq, req, res, options) => {
  proxyReq.setHeader('User-Agent', proxyReq.getHeader('proxy-override-user-agent') || DEFAULT_USERAGENT);
  const overrideCookie = proxyReq.getHeader('proxy-override-cookie');
  if (overrideCookie) {
    proxyReq.setHeader('Cookie', overrideCookie);
  }
  if (REWRITE_ACCEPT_ENCODING) {
    proxyReq.setHeader('Accept-Encoding', 'gzip');
  }
  proxyReq.removeHeader('roblox-id');
  proxyReq.removeHeader('proxy-access-key');
  proxyReq.removeHeader('proxy-target');
};

const onProxyRes = (proxyRes, req, res) => {
  const head = {
    headers: Object.assign({}, proxyRes.headers),
    status: {
      code: proxyRes.statusCode,
      message: proxyRes.statusMessage
    }
  };
  if (USE_OVERRIDE_STATUS) {
    proxyRes.statusCode = 200;
  }
  if (APPEND_HEAD) {
    const append = `"""${JSON.stringify(head)}"""`;
    const encoding = proxyRes.headers['content-encoding'];
    let handler;
    let encoder;
    let appendEncoded;
    switch (encoding) {
      case 'gzip':
        handler = zlib.gzip;
        break;
      default:
        appendEncoded = append;
    }
    if (handler) {
      encoder = new Promise((resolve, reject) => {
        handler(append, (e, buf) => {
          if (e) {
            reject(e);
          }
          appendEncoded = buf;
          resolve();
        });
      });
    }
    if ('content-length' in proxyRes.headers) {
      delete proxyRes.headers['content-length'];
    }
    const _end = res.end;
    res.end = async () => {
      if (!appendEncoded) {
        try {
          await encoder;
        } catch (e) {
          console.error(`Encoder error: ${e}`);
          return;
        }
      }
      res.write(appendEncoded);
      _end.call(res);
    };
  }
};

httpsProxy.on('error', onProxyError);
httpsProxy.on('proxyReq', onProxyReq);
httpsProxy.on('proxyRes', onProxyRes);

httpProxy.on('error', onProxyError);
httpProxy.on('proxyReq', onProxyReq);
httpProxy.on('proxyRes', onProxyRes);

const doProxy = (target, proto, req, res) => {
  var options = {
    target: proto + '://' + target.host
  };
  if (proto === 'https') {
    httpsProxy.web(req, res, options);
  } else if (proto === 'http') {
    httpProxy.web(req, res, options);
  } else {
    throw new Error(`Do proxy error: Unsupported protocol ${proto}`);
  }
};

server.on('request', (req, res) => {
  const method = req.headers['proxy-target-override-method'];
  if (method) {
    if (ALLOW_OVERRIDE_METHOD) {
      if (ALLOWED_METHODS.includes(method)) {
        req.method = method;
      } else {
        writeErr(res, 400, 'Invalid target method');
        return;
      }
    } else {
      writeErr(res, 400, 'Method override is not permitted');
      return;
    }
  }
  const overrideProto = req.headers['proxy-target-override-proto'];
  if (overrideProto && !ALLOWED_PROTOS.includes(overrideProto)) {
    writeErr(res, 400, 'Invalid target protocol');
    return;
  }
  const accessKey = req.headers['proxy-access-key'];
  const requestedTarget = req.headers['proxy-target'];
  if (accessKey && requestedTarget) {
    req.on('error', (err) => {
      console.error(`Request error: ${err}`);
    });
    if (accessKey === ACCESS_KEY) {
      let parsedTarget;
      try {
        parsedTarget = new URL(`https://${requestedTarget}`);
      } catch (e) {
        writeErr(res, 400, 'Invalid target');
        return;
      }
      const requestedHost = parsedTarget.host;
      let hostAllowed = false;
      let hostProto = DEFAULT_PROTO;
      for (let i = 0; i < ALLOWED_HOSTS.length; i++) {
        const iHost = ALLOWED_HOSTS[i];
        if (requestedHost === iHost.host) {
          hostAllowed = true;
          hostProto = iHost.proto;
          break;
        }
      }
      if (!USE_WHITELIST) {
        hostAllowed = true;
      }
      if (overrideProto) {
        hostProto = overrideProto;
      }
      if (hostAllowed) {
        doProxy(parsedTarget, hostProto, req, res);
      } else {
        writeErr(res, 400, 'Host not whitelisted');
      }
    } else {
      writeErr(res, 403, 'Invalid access key');
    }
  } else {
    writeErr(res, 400, 'proxy-access-key and proxy-target headers are both required');
  }
});

server.listen(PORT, (err) => {
  if (err) {
    console.error(`Server listening error: ${err}`);
    return;
  }
  console.log(`Server started on port ${PORT}`);
});
