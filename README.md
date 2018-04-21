## ProxyService

Roblox's HttpService has always been severely lacking. This open-source project essentially aims to serve as a replacement, providing an Http client that opens the door to actually using REST APIs, reading response headers, reading status codes, accessing roblox.com from in-game, and more.

Example uses are accessing Roblox, Discord, Trello, and Firebase APIs, including crazy stuff like logging into a Roblox account from in Roblox. You can use this for virtually any API.

The way it works is that the game makes a request to a proxy server instead of the server you want to access and the proxy server actually sends the request for you. It returns an HTTP 200 so Roblox does not error and then appends response headers/codes to the response. This is all done in the background with a free, open-source, personal server that you can setup very easily.

**Features**

This makes Roblox Http requests more complete by adding support for the following features:
- Make PUT, PATCH, and DELETE requests in addition to GET and POST requests (with that, be able to use REST APIs from Roblox).
- Read response headers.
- Read the status code and status message.
- Modify the User-Agent header (usually not allowed by Roblox).
- Read response even if the response contains a 400- or 500- status code (this includes body, headers, and the status code and message).
- Access sites usually unavailable, including roblox.com APIs as well as discord webhooks (and being able to view headers means you will be able to obey discord rate limits, which means this proxy [is allowed](https://twitter.com/lolpython/status/967211620970545153)).

**Server Setup Tutorial**

- Create a heroku account here: https://signup.heroku.com. Make sure to verify your email and set a password. If you already have a heroku account, log into it.
- Click this button

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/sentanos/ProxyService)

- Type in whatever name you want.
- Click "Deploy app". Don't touch any of the variables unless you know what you're doing.
- Click view and copy the URL.
- Click manage app and go to `Settings > Reveal Config Vars` and copy the ACCESS_KEY.

That's it.

(Setting up without heroku is simple: run `node server.js` with the environment variables specified [here](/app.json))

**Client Setup Tutorial**

- Get the handler script from [here](https://github.com/sentanos/ProxyService/blob/master/client/ProxyService.mod.lua) and put it in a module script in ServerScriptService.
- In the script you want to use this from, require the ModuleScript. If your module is named "ProxyService", for example, you would add `local ProxyService = require(game:GetService('ServerScriptService').ProxyService)` to the top of your script.
- Add a line to create your proxy client, this will generally look like this: `local Proxy = ProxyService:New('PASTE_DOMAIN_HERE', 'PASTE_ACCESS_KEY_HERE')` (see below for a more complete example)
- Use Proxy exactly as you would use [HttpService](http://wiki.roblox.com/index.php?title=API:Class/HttpService). The only difference is an extra `overrideProto` argument. You can pass in `http` if you are using an API that doesn't support https (the default protocol).

**Video Tutorial**

Here's a video of the above instructions (excluding heroku sign up):

https://www.youtube.com/watch?v=Ull8w4J_WYQ

**Client API**

```http
ProxyService:New(root, accessKey)
  returns Proxy
Proxy:Get(url, nocache, headers, overrideProto)
Proxy:Delete(url, nocache, headers, overrideProto)
Proxy:Post(url, data, contentType, compress, headers, overrideProto)
Proxy:Put(url, data, contentType, compress, headers, overrideProto)
Proxy:Patch(url, data, contentType, compress, headers, overrideProto)
```

All methods return
```json
{
  "headers": {
    "name": "value"
  },
  "body": "string",
  "status": {
    "code": "number",
    "message": "string"
  }
}
```

**_Note that all response headers are lowercase_**

Root is the root of your heroku application including the http:// or https://.

Simple example script:

```lua
local ProxyService = require(script.Parent.ProxyService)
local Proxy = ProxyService:New('https://prxysvr.herokuapp.com', '6ddea1d2a6606f01538e8c92bbf8ba1e9c6aaa46e0a24cb0ce32ef0444130d07')

print(Proxy:Get('https://api.roblox.com/users/2470023').body)
-- Note that the proxied request will always be https unless specified by overrideProto
-- The protocol of the request to the proxy is dependent on the root and not the url
```

Advanced example script (login to a user and remove their primary group):

_(Actually logging in to a Roblox account from in-game to use essential functions is not recommended)_
```lua
local ProxyService = require(script.Parent.ProxyService)
local Proxy = ProxyService:New('https://prxysvr.herokuapp.com', '6ddea1d2a6606f01538e8c92bbf8ba1e9c6aaa46e0a24cb0ce32ef0444130d07')
local username = 'Shedletsky'
local password = 'hunter2'
local tokenCache
local getWithToken

local http = game:GetService('HttpService')
local encode = http.JSONEncode

getWithToken = function (handler, retry, ...)
  local res = handler(tokenCache, ...)
  if res.status.code == 403 and res.status.message == 'Token Validation Failed' then
    if retry then
      error('Failed to get token')
      return
    end
    tokenCache = res.headers['x-csrf-token']
    return getWithToken(handler, true, ...)
  elseif res.status.code == 200 then
    return res
  else
    error('Login error: ' .. res.status.message)
  end
end

local createTokenHandler = function (handler)
  return function (...)
    return getWithToken(handler, false, ...);
  end
end

local loginHandler = function (token)
  return Proxy:Post('https://auth.roblox.com/v2/login', encode(http, {
    ctype = 'Username',
    cvalue = username,
    password = password
  }), Enum.HttpContentType.ApplicationJson, false, {
    ['X-CSRF-TOKEN'] = token
  })
end

local deletePrimaryHandler = function (token, cookie)
  return Proxy:Delete('https://groups.roblox.com/v1/user/groups/primary', nil, {
    ['X-CSRF-TOKEN'] = token,
    ['Cookie'] = cookie
  })
end

local login = createTokenHandler(loginHandler)
local deletePrimary = createTokenHandler(deletePrimaryHandler)

local res = login()
local cookie = res.headers['set-cookie'][1]:match('.ROBLOSECURITY=.-;'):gsub('_|.-|_', '')

deletePrimary(cookie)

print('Done')
```

Responses are different with ProxyService: instead of just the body, a table is returned with a dictionary of headers in the `headers` field, the body in the `body` field, and the status code and message in the `status` field.

Example response:

```json
{
  "headers": {
    "set-cookie": "one=two;",
    "content-encoding": "gzip"
  },
  "body": "Success",
  "status": {
    "code": 200,
    "message": "OK"
  }
}
```

**Notes**

- Requests use https by default, if the endpoint you are trying to access does not support https you must override the protocol (see API above).
- Despite using https, server certificates aren't actually validated. If you want to do so you'll have to deal with installing client certificates.
- Although the appending process seems simple at first (just write the extra data after the proxy response has been received), it becomes a lot more complicated when factoring in encodings. In order to add additional data the server has to first decode the response, append the data, and then re-encode the entire thing. Two alternative methods are available: one is to decode and not re-encode (sacrificing bandwidth for server performance), and the other is to append a separate gzip file to the request. The latter option seems to be the most ideal overall, but unfortunately it is not stable: that is, it is not supported by any spec, yet occasionally a client will support it because of the way they implement gzip. The Roblox client does not support this, unfortunately, but this proxy was created with non-Roblox clients in mind. To change the way the server handles encoded data you can change the `GZIP_METHOD` environment variable to any of these three values: `["transform", "decode", "append"]`.
- Accept-Encoding is always overwritten to "gzip" because deflate is not supported. This is unlikely to affect anybody at all.
- Heroku gives a generous number of free dyno hours, but note that without adding a credit card you are not able to run one dyno 24 hours nonstop. If you just add a credit card you'll get enough hours for the server to be constantly on for an entire month, every month, even if you don't actually spend any money.
