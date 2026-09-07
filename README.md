# which-llm-i-can-use · 大模型能力与性能测试台

浏览器端的 LLM 测试台：录入任意 **OpenAI 兼容端点**，一次性测清它的时延与吞吐、模型能力支持度，以及非常规消息格式的兼容性。

**所有请求都由浏览器直接发往你填写的模型服务商，本项目没有任何后端接口**；API Key、模型配置与测试结果只保存在浏览器本地存储里。

---

## 测什么

### 1. 性能测试

| 测试项 | 说明 |
| --- | --- |
| 流式生成性能 | TTFT（首 token 时延）、输出 token/s、端到端时延，多轮取 p50 / p95，并统计 ITL 抖动 |
| 非流式生成性能 | `stream: false` 下的端到端时延，并与流式对比首字等待差 |
| Prompt Cache 命中与加速 | 复用完全相同的长前缀，检测 `cached_tokens` 类字段与 TTFT 降幅 |
| 实时语音对话适配度 | 把上述指标折算成 A / B / C / D 评级，并给出可读的结论理由 |

多轮性能测试会在**提示词最前面注入随机 run-id**，破坏前缀以规避 Prompt Cache，保证测到的是真实冷启动表现。

### 2. 模型能力测试

- **推理与思维链**：是否回传思维链（`reasoning_content` / `reasoning` / `reasoning_details` / `<think>` 四种通道）；`reasoning_effort` 的 low / medium / high 是否被接受且**真的生效**；关闭思维链的六种写法逐一探测（`reasoning_effort: "minimal"`、`"none"`、`thinking: {type:"disabled"}`、`enable_thinking: false`、`chat_template_kwargs`、`reasoning: {enabled:false}`）。
- **工具调用**：基础 Function Calling、`tool_choice: "required"` 强制调用（LangChain 结构化输出依赖此模式，页面内有专门说明）、指名函数调用、并行工具调用、`tool_calls → tool → answer` 完整回填闭环。
- **结构化输出**：`json_object`、JSON Schema（非严格）、JSON Schema（`strict: true`）、嵌套 schema（嵌套对象 + 数组 + enum），返回内容会用内置校验器逐字段核对。
- **多模态**：浏览器用 canvas 现场生成一张写着**随机两位数**的图片，以 base64 传入，验证模型是否真的能读图。

### 3. 消息格式兼容性

- 开头连续多条 `system`、对话中间插入 `system`、`developer` 角色
- 连续多条 `user` / 连续多条 `assistant`、以 `assistant` 结尾（前缀续写）
- 悬空的 `tool_calls`（没有配对的结果）、孤立的 `tool` 结果（前面没有 `tool_calls`）
- 数组形式的 `content`、无 `system` 的最小请求

判定分三层：**参数被接受** → **语义真的生效** → **结果符合预期**。只有三层都过才记为「支持」，避免网关静默忽略参数造成的假阳性。

---

## 本地开发

```bash
npm install
npm run dev            # 开发服务器
npm run dev:mock       # 另开一个终端：本地 Mock 的 OpenAI 兼容服务（localhost:8787/v1）
```

Mock 服务提供四个行为各异的模型（`mock-basic` / `mock-reasoner` / `mock-strict` / `mock-slow`），
不消耗任何真实额度即可把整条链路跑通，方便开发与验证判定逻辑。

其它命令：

```bash
npm run typecheck      # TypeScript 检查
npm run assets         # 重新生成 favicon / og.png / 应用图标
npm run build          # 生产构建（含静态 SEO 页面、sitemap、_headers）
npm run preview        # 预览构建产物
```

---

## 部署到 Cloudflare

构建产物是纯静态文件，两种方式任选其一。

### Cloudflare Workers（静态资源）

```bash
npx wrangler login
npm run deploy
```

`wrangler.jsonc` 已配置 `assets.directory = ./dist`，并启用了目录索引与 SPA 回退。

### Cloudflare Pages

```bash
npm run deploy:pages
```

或在 Pages 控制台直连 Git 仓库：

- 构建命令：`npm run build`
- 输出目录：`dist`

构建会自动生成 `_headers`（安全响应头 + 缓存策略）与 `_redirects`（SPA 回退），Pages 会直接生效。

### 自定义域名

站点地址写在 `.env` 的 `VITE_SITE_URL`，用于 canonical、Open Graph、sitemap。换域名后改这里再重新构建即可：

```bash
VITE_SITE_URL=https://your-domain.com npm run build
```

---

## 隐私设计

- **没有后端接口**：整站是静态资源，页面加载完成后浏览器与本站不再有任何通信。
- **不埋点**：没有分析脚本、广告 SDK、第三方追踪器，不写 Cookie。
- **密钥只在本机**：API Key 与其它配置分开存放，可选择存 `localStorage`（长期）或 `sessionStorage`（关闭标签页即清除）；导出备份时默认剔除。
- **可一键清空**：「隐私与安全」页提供仅清除测试记录 / 清空全部数据两种操作。
- **CSP**：构建产物带 `Content-Security-Policy`，`connect-src` 放开是因为你需要连接自己填写的任意模型端点，其余指令均收紧。

### 关于 CORS

浏览器直连要求目标服务返回 `Access-Control-Allow-Origin`。部分服务商只面向服务端调用，此时页面会明确提示「疑似 CORS 未放行」。
可以在服务商配置里填写**你自己可控的**中转地址（支持 `{url}` 占位写法），启用后卡片会显示「经中转」标记 —— 请不要使用来路不明的公共代理。

本地模型：Ollama 需要设置 `OLLAMA_ORIGINS`，vLLM / SGLang 需要 `--allowed-origins`。

---

## 技术栈

React 18 · TypeScript · Vite · Tailwind CSS。无 UI 框架依赖，运行时体积约 60 KB（gzip，不含 vendor）。
测试用例集中在 `src/tests/`，每个用例自带面向用户的说明文档，页面与静态 SEO 内容都从同一份注册表生成。

## License

MIT
