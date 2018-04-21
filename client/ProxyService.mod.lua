local http = game:GetService('HttpService')
local _get = http.GetAsync
local _post = http.PostAsync
local _decode = http.JSONDecode

local POST_METHODS = {'POST', 'PUT', 'PATCH'}
local GET_METHODS = {'GET', 'DELETE'}

local ProxyService = {}

local processBody = function (body)
  local pos, _, match = body:find('"""(.+)"""$')
  local data = _decode(http, match)
  local res = {
    headers = data.headers,
    status = data.status,
    body = body:sub(1, pos - 1)
  }
  return res
end

local httpGet = function (...)
  local body = _get(http, ...)
  return processBody(body)
end

local httpPost = function (...)
  local body = _post(http, ...)
  return processBody(body)
end

local getHeaders = function (this, method, target, headers, overrideProto)
  local sendHeaders = headers or {}
  sendHeaders['proxy-access-key'] = this.accessKey
  sendHeaders['proxy-target'] = target
  if overrideProto then
    sendHeaders['proxy-target-override-proto'] = overrideProto
  end
  if method ~= 'GET' and method ~= 'POST' then
    sendHeaders['proxy-target-override-method'] = method
  end
  if headers then
    for header, value in next, headers do
      local headerLower = header:lower();
      if headerLower == 'user-agent' then
        sendHeaders['user-agent'] = nil
        sendHeaders['proxy-override-user-agent'] = value
      end
    end
  end
  return sendHeaders
end

local generatePostHandler = function (method)
  return function (self, target, path, data, contentType, compress, headers, overrideProto)
    local sendHeaders = getHeaders(self, method, target, headers, overrideProto)
    return httpPost(self.root .. path, data, contentType, compress, sendHeaders)
  end
end

local generateGetHandler = function (method)
  return function (self, target, path, nocache, headers, overrideProto)
    local sendHeaders = getHeaders(self, method, target, headers, overrideProto)
    return httpGet(self.root .. path, nocache, sendHeaders)
  end
end

local urlProcessor = function (callback)
  return function (self, url, ...)
    local _, endpos = url:find('://')
    local nextpos = url:find('/', endpos + 1) or #url + 1
    local target = url:sub(endpos + 1, nextpos - 1)
    local path = url:sub(nextpos)
    return callback(self, target, path, ...)
  end
end

local generateWithHandler = function (handler, method, handlerMethod)
  ProxyService[method:sub(1,1):upper() .. method:sub(2):lower()] = urlProcessor(handler(method))
end

for _, method in next, POST_METHODS do
  generateWithHandler(generatePostHandler, method)
end
for _, method in next, GET_METHODS do
  generateWithHandler(generateGetHandler, method)
end

function ProxyService:New(root, accessKey)
  if root:sub(#root, #root) == '/' then
    root = root:sub(1, #root - 1)
  end
  if not root:find('^http[s]?://') then
    error('Root must include http:// or https:// at the beginning')
  end
  self.root = root
  self.accessKey = accessKey
  return self
end

return ProxyService
