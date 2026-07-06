# MiMoCode WebUI 启动与真实链路验证手册

## 适用场景

本文记录当前 MiMoCode WebUI 在 `http://192.168.10.236:8090/` 的正确启动方式、必要环境变量、以及已经完成的真实链路验证结果。

当前项目目录：

```text
/vol2/1000/下载/mimo/mimo-code-webui
```

当前 WebUI 依赖两个服务：

- `mimo serve`：监听 `127.0.0.1:4096`
- WebUI Express 后端：监听 `0.0.0.0:8090`

## 必须先知道的前提

`session.diff` 依赖 MiMo 官方 snapshot 机制，而 snapshot 只在 Git 项目中启用。

本目录已经执行过：

```bash
git init
```

但目录 ownership 是混合的：

```text
/vol2/1000/下载/mimo/mimo-code-webui       com.dustinky.qwenpaw:com.dustinky.qwenpaw
/vol2/1000/下载/mimo/mimo-code-webui/.git  yzy:Users
```

因此如果直接运行 `git` 或直接启动 `mimo serve`，可能遇到：

```text
fatal: detected dubious ownership in repository
```

不要为了 WebUI 运行去写全局 Git 配置。当前验证过的安全做法是：启动 `mimo serve` 时使用进程级 `safe.directory` 环境变量。

## 正确启动方式

### 1. 启动 MiMo serve

从项目根目录运行：

```bash
GIT_CONFIG_COUNT=1 \
GIT_CONFIG_KEY_0=safe.directory \
GIT_CONFIG_VALUE_0=/vol2/1000/下载/mimo/mimo-code-webui \
mimo serve --hostname=127.0.0.1 --port=4096
```

如果需要后台运行并写日志：

```bash
GIT_CONFIG_COUNT=1 \
GIT_CONFIG_KEY_0=safe.directory \
GIT_CONFIG_VALUE_0=/vol2/1000/下载/mimo/mimo-code-webui \
mimo serve --hostname=127.0.0.1 --port=4096 > /tmp/mimo-serve-4096.log 2>&1 &
```

验证健康状态：

```bash
curl -sS http://127.0.0.1:4096/global/health
```

期望返回：

```json
{"healthy":true,"version":"0.1.4"}
```

验证项目被识别为 Git 项目：

```bash
curl -sS http://127.0.0.1:4096/project
```

期望包含：

```json
{
  "worktree": "/vol2/1000/下载/mimo/mimo-code-webui",
  "vcs": "git"
}
```

如果只看到：

```json
{"id":"global","worktree":"/"}
```

说明 `mimo serve` 没有把 WebUI 目录识别成 Git 项目，`session.diff` 很可能会返回空数组。

### 2. 启动 WebUI 后端

在项目根目录运行：

```bash
HOST=0.0.0.0 PORT=8090 npm start -w server
```

如果本机 shell 找不到 `node` / `npm`，使用本环境验证过的 PATH：

```bash
HOST=0.0.0.0 PORT=8090 \
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" \
npm start -w server
```

如果要后台运行：

```bash
HOST=0.0.0.0 PORT=8090 \
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" \
npm start -w server > /tmp/mimo-code-webui-8090.log 2>&1 &
```

验证 WebUI 状态：

```bash
curl -sS http://127.0.0.1:8090/status
```

期望重点字段：

```json
{
  "webui": {
    "port": 8090,
    "host": "0.0.0.0"
  },
  "mimo": {
    "url": "http://127.0.0.1:4096",
    "healthy": true,
    "version": "0.1.4"
  }
}
```

浏览器入口：

```text
http://192.168.10.236:8090/
```

## 已完成的真实链路验证结果

以下结果均通过真实 `8090` 浏览器入口和真实 `mimo serve` 验证，不是 mock。

### 基础聊天

状态：已打通。

验证点：

- WebUI 发送 prompt 到 `/api/session/:id/prompt_async`
- MiMo serve 接收并生成 assistant message
- WebUI 通过 SSE / 轮询刷新显示 assistant 文本

### 非默认模型回复与流式/刷新

状态：已打通。

验证点：

- `libwrt/gpt-5.5` 可通过 native `prompt_async` 返回回复
- 空 assistant placeholder 不再被误判为完成
- 页面无需手动刷新即可看到后续文本

### WebUI 独立会话

状态：已打通。

验证点：

- WebUI 不再默认抢当前 CLI/debug session
- WebUI 会创建或恢复自己拥有的 session
- 浏览器消息不再等 CLI 侧唤醒才得到回复

### Permission 授权弹窗

状态：已打通。

验证点：

- 页面启动会拉取 `/permission`
- 弹窗显示官方字段：`permission`、`patterns`、`metadata`、`always`、`tool`
- 点击允许一次发送：

```json
{"reply":"once"}
```

- `POST /api/permission/:id/reply` 返回 `200`
- 弹窗关闭，`GET /permission` 返回 `[]`

### Question 提问弹窗

状态：已打通。

验证 prompt：

```text
QUESTION-REAL-CHAIN-1783314500 请必须调用 question 工具向我提一个单选问题。
```

验证点：

- MiMo 实际调用 `question` 工具
- WebUI 弹出 `代理提问`
- 选择 `继续 (Recommended)` 后发送：

```json
{"answers":[["继续 (Recommended)"]]}
```

- `POST /api/question/:id/reply` 返回 `200`
- 弹窗关闭，模型继续回复

### Abort 中断

状态：已打通。

验证 prompt：

```text
ABORT-REAL-CHAIN-1783315600 请开始一个很长的回复：从 1 数到 5000，每个数字一行。
```

验证点：

- 页面进入 busy 状态
- 点击停止按钮
- 发送：

```http
POST /api/session/:id/abort
```

- 返回 `200`
- 输入框恢复可用

### 联网 / WebFetch

状态：已打通。

关键修正：联网模式使用官方存在的 `explore` agent，而不是不存在的 `web-search` agent。

验证 prompt：

```text
WEBFETCH-UI-FINAL-1783317200 请使用 webfetch 读取 https://example.com ，然后只用中文回复这个网页标题。
```

验证点：

- 请求体包含：

```json
"agent":"explore"
```

- MiMo 实际调用 `webfetch`
- 最终页面显示：

```text
示例域名
```

### Tool call 展示

状态：已打通。

验证 prompt：

```text
TOOLCARD-REAL-CHAIN-1783317900 请使用 webfetch 读取 https://example.com，然后回复网页标题。
```

页面显示：

```text
工具：webfetch
状态：completed
{
  "url": "https://example.com",
  "format": "markdown"
}
Example Domain
```

真实文件写入链路也显示了：

```text
工具：read
状态：completed

工具：write
状态：completed
Wrote file successfully.
```

### Todo 任务显示

状态：已打通。

验证 prompt：

```text
TASK-REAL-CHAIN-1783317000 请必须使用 task 工具创建两个任务...
```

服务端 `/session/:id/todo` 返回：

```json
[
  { "content": "验证 Todo 刷新显示", "status": "pending" },
  { "content": "验证 Todo 完成计数", "status": "pending" }
]
```

页面显示：

```text
任务 0/2
验证 Todo 刷新显示
验证 Todo 完成计数
```

### Session Diff 文件变更

状态：已打通，但依赖 Git 项目识别和 `safe.directory` 启动方式。

验证文件：

```text
docs/compose/diff-verification.txt
```

真实修改：

```diff
-diff verified 1783318200
+diff verified 1783320400
```

服务端 session summary：

```json
{
  "additions": 1,
  "deletions": 1,
  "files": 1
}
```

`GET /session/:id/diff?messageID=:userMessageID` 返回：

```json
[
  {
    "file": "docs/compose/diff-verification.txt",
    "additions": 1,
    "deletions": 1,
    "status": "modified"
  }
]
```

页面显示：

```text
变更 1 文件 +1 -1
docs/compose/diff-verification.txt
```

## 常见问题排查

### `/session/:id/diff` 返回 `[]`

先检查项目是否被识别为 Git：

```bash
curl -sS http://127.0.0.1:4096/project
```

如果没有看到：

```json
"worktree": "/vol2/1000/下载/mimo/mimo-code-webui",
"vcs": "git"
```

说明 `mimo serve` 没有进入 Git-backed snapshot 模式。重启 `mimo serve`，并带上进程级 `safe.directory` 环境变量。

### 联网模式没有消息

检查 prompt 请求体里的 agent。正确值应为：

```json
"agent":"explore"
```

错误值：

```json
"agent":"web-search"
```

`web-search` 不是当前官方 agent 名称，会导致 `prompt_async` 看似发出但 session 里没有有效消息。

### 授权按钮点击无反应

检查 body 字段。正确字段是：

```json
{"reply":"once"}
```

错误字段是：

```json
{"response":"once"}
```

`response` 只属于旧的 deprecated session permission endpoint，不适用于 `/permission/:id/reply`。

## 最后一次验证命令

前端类型检查：

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run typecheck -w web
```

前端构建：

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run build -w web
```

两者均已通过。
