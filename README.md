## ProxyService

This is an open source proxy primarily serving as a more complete Http client for Roblox. This will proxy any Http request including post data, path, and headers. It can be configured with an access key to prevent unauthorized users from using it.

**Features**
This makes Roblox Http requests more complete by adding support for the following features:
- Make PUT, PATCH, and DELETE requests in addition to GET and POST requests.
- Read response headers.
- Read the status code and status message.
- Modify the User-Agent header (usually not allowed by Roblox).
- Send Cookie header with "|" characters (or other characters which are usually blocked).
- Read response even if the response contains a 400- or 500- status code (this includes body, headers, and the status code and message).
- Access sites usually unavailable, including roblox.com APIs as well as discord webhooks (and being able to view headers means you will be able to obey discord rate limits, which means this proxy [is allowed](https://twitter.com/lolpython/status/967211620970545153)).

**Setup Tutorial**

- Click this button

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)

- Create an account if you need to. Once you're done, come back and click the button again. Login if you need to.
- Type in whatever name you want.
- Click "Deploy app".
- Click view and copy the URL.
- Click manage app and go to `Settings > Reveal Config Vars` and copy the ACCESS_KEY.

That's it.

(Setting up without heroku is simple: run `node server.js` with the environment variables specified [here](/app.json))

**Client**

Now you can get the handler script from [here](/client/ProxyService.mod.lua) and put it in a module script in ServerScriptService. Usage is almost exactly the same as [HttpService](http://wiki.roblox.com/index.php?title=API:Class/HttpService) except with an extra `overrideProto` argument. You can pass in `http` or `https` for this argument to override the default protocol for that specific domain (the default is https).

```http
ProxyService:New(root, accessKey)
Proxy:Get(url, nocache, headers, overrideProto)
Proxy:Delete(url, nocache, headers, overrideProto)
Proxy:Post(url, data, contentType, compress, headers, overrideProto)
Proxy:Put(url, data, contentType, compress, headers, overrideProto)
Proxy:Patch(url, data, contentType, compress, headers, overrideProto)
```

Root is the root of your heroku application including the http:// or https://.

Example:

```lua
local ProxyService = require(script.Parent.ProxyService)
local Proxy = ProxyService:New('https://proxyservice.herokuapp.com', '6ddea1d2a6606f01538e8c92bbf8ba1e9c6aaa46e0a24cb0ce32ef0444130d07')

print(Proxy:Get('https://api.roblox.com/users/2470023').body)
-- Note that the proxied request will always be https unless specified by overrideProto
-- The protocol of the request to the proxy is dependent on the root and not the url
```

Responses are different with ProxyService: instead of just the body, a table is returned with a dictionary of headers in the `headers` field, the body in the `body` field, and the status code and message in the `status` field. _Note that all response headers are lowercase_

Example:

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
- Despite using https, server certificates aren't actually validated. If you want to do so it involves installing client certificates.
- Accept-Encoding is always overwritten to "gzip" because deflate is not supported. This is unlikely to affect you.
