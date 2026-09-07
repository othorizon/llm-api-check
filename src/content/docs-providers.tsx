import type { Locale } from "@/i18n/core";
import { getDict } from "@/i18n";
import { PROVIDER_PRESETS } from "@/lib/providers/presets";

export function ProvidersDocsContent({ locale }: { locale: Locale }) {
  const dict = getDict(locale);
  const zh = locale === "zh";
  return (
    <div className="prose-doc">
      <p>
        {zh
          ? "本站只依赖 OpenAI Chat Completions 接口：POST {baseUrl}/chat/completions（以及可选的 GET {baseUrl}/models）。下表列出内置预设的 Base URL、浏览器直连（CORS）支持情况与推理参数写法。“未验证”表示我们没有该服务商允许浏览器跨域请求的确切资料——直接试一下连通性测试即可知道。"
          : "The site relies only on the OpenAI Chat Completions API: POST {baseUrl}/chat/completions (plus the optional GET {baseUrl}/models). The table lists the built-in presets with their base URL, browser (CORS) support and reasoning dialects. “Unverified” means we have no firm information that the provider allows cross-origin browser requests — the connection test will tell you in seconds."}
      </p>
      <h2 id="cors">{zh ? "关于 CORS" : "About CORS"}</h2>
      <p>
        {zh
          ? "浏览器在向另一个域名发送带自定义请求头（Authorization、Content-Type: application/json）的请求前，会先发送 OPTIONS 预检请求。只有当服务商返回 Access-Control-Allow-Origin 等响应头时，真正的请求才会发出。被拦截时，fetch 会抛出“Failed to fetch”，本站将其归类为网络错误。"
          : "Before sending a cross-origin request with custom headers (Authorization, Content-Type: application/json), the browser issues an OPTIONS preflight. The real request only goes out if the provider answers with Access-Control-Allow-Origin and friends. When blocked, fetch throws “Failed to fetch”, which this site classifies as a network error."}
      </p>
      <ul>
        <li>{zh ? "已知支持浏览器直连：OpenAI、Anthropic（需 anthropic-dangerous-direct-browser-access 头，预设已添加）、DeepSeek、Gemini、xAI、Mistral、Groq、Cerebras、Fireworks、Together、OpenRouter。" : "Known to allow browser calls: OpenAI, Anthropic (with the anthropic-dangerous-direct-browser-access header, added by the preset), DeepSeek, Gemini, xAI, Mistral, Groq, Cerebras, Fireworks, Together, OpenRouter."}</li>
        <li>{zh ? "本地服务需要显式开启：Ollama 设置 OLLAMA_ORIGINS，LM Studio 在服务器设置中开启 CORS，vLLM 使用 --allowed-origins。" : "Local servers must opt in: OLLAMA_ORIGINS for Ollama, the CORS switch in LM Studio's server settings, --allowed-origins for vLLM."}</li>
        <li>{zh ? "不支持直连的服务商可以通过你自己部署的网关（LiteLLM、One API / New API、Cloudflare AI Gateway）访问，把网关地址填为自定义 Base URL。请勿使用不受你控制的公共代理——你的密钥会经过它。" : "Providers that block browsers can be reached through a gateway you deploy yourself (LiteLLM, One API / New API, Cloudflare AI Gateway) entered as a custom base URL. Never use a public proxy you do not control — your key would pass through it."}</li>
      </ul>
      <h2 id="http">{zh ? "只有 http:// 的接口怎么办" : "Endpoints that only speak plain http://"}</h2>
      <p>
        {zh
          ? "本站通过 HTTPS 提供服务，而浏览器禁止 HTTPS 页面向明文 http:// 地址发起请求（混合内容拦截）。这和 CORS 无关，网站自身无法绕过。唯一的例外是 http://localhost、http://127.0.0.1 与 http://*.localhost：浏览器把它们视为可信来源，所以本机的 Ollama、LM Studio、vLLM 可以直接用。其他情况按推荐顺序："
          : "This site is served over HTTPS, and browsers refuse to let an HTTPS page call a plain http:// address (mixed-content blocking). It is unrelated to CORS and the site cannot work around it. The one exception is http://localhost, http://127.0.0.1 and http://*.localhost, which browsers treat as trustworthy, so local Ollama, LM Studio or vLLM work directly. For everything else, in order of preference:"}
      </p>
      <ol>
        <li>
          <strong>{zh ? "映射到 localhost。" : "Forward it to localhost."}</strong>{" "}
          {zh ? "用 SSH 端口转发把远端接口映射到本机，然后把 Base URL 填成 localhost：" : "Use SSH port forwarding to map the remote endpoint onto your machine, then use a localhost base URL:"}
          <pre>
            <code>{"ssh -N -L 8000:internal-host:8000 user@bastion\n# Base URL: http://localhost:8000/v1"}</code>
          </pre>
        </li>
        <li>
          <strong>{zh ? "给接口套一层 HTTPS。" : "Put the endpoint behind HTTPS."}</strong>{" "}
          {zh ? "Caddy 一行配置即可自动申请证书；内网服务可以用 cloudflared 隧道暴露成 HTTPS 域名：" : "Caddy obtains certificates automatically with a one-line config; cloudflared exposes an internal service as an HTTPS hostname:"}
          <pre>
            <code>{"# Caddyfile\napi.example.com {\n  reverse_proxy 127.0.0.1:8000\n}\n\n# or\ncloudflared tunnel --url http://127.0.0.1:8000"}</code>
          </pre>
        </li>
        <li>
          <strong>{zh ? "在本地运行本站。" : "Run this site locally."}</strong>{" "}
          {zh ? "从 http://localhost:5173 打开的页面不受混合内容限制，可以访问任何 http:// 地址，数据依然只在浏览器里：" : "A page opened from http://localhost:5173 is not subject to mixed-content rules and can call any http:// address; data still never leaves the browser:"}
          <pre>
            <code>{"git clone https://github.com/othorizon/llm-api-check.git\ncd llm-api-check && npm install && npm run dev"}</code>
          </pre>
        </li>
        <li>
          <strong>{zh ? "浏览器侧放行（临时）。" : "Allow it in the browser (temporary)."}</strong>{" "}
          {zh
            ? "Chrome：站点设置 → 不安全内容 → 允许 llmapicheck.dev；Firefox：about:config 中将 security.mixed_content.block_active_content 设为 false。这会降低本站的安全性，用完请恢复。"
            : "Chrome: Site settings → Insecure content → Allow for llmapicheck.dev; Firefox: set security.mixed_content.block_active_content to false in about:config. This weakens the site's security, so revert it afterwards."}
        </li>
        <li>
          <strong>{zh ? "局域网地址（仅 Chromium）。" : "Local-network addresses (Chromium only)."}</strong>{" "}
          {zh
            ? "对 192.168.x.x、10.x.x.x、*.local 这类地址，本站会在请求里声明目标为本地网络（Local Network Access）。新版 Chrome 会弹出“允许访问本地网络”的授权，允许后即可直连；Firefox 与 Safari 仍会拦截。"
            : "For addresses such as 192.168.x.x, 10.x.x.x or *.local this site marks the request as targeting the local network (Local Network Access). Recent Chrome shows an “allow local network access” prompt and lets the request through once granted; Firefox and Safari still block it."}
        </li>
      </ol>
      <p>{zh ? "不可行的是服务端代理：Cloudflare Worker 既够不到内网，也违背“密钥不经过服务器”的原则。" : "A server-side proxy is not an option: a Cloudflare Worker cannot reach your internal network, and it would break the promise that keys never pass through a server."}</p>
      <h2 id="presets">{zh ? "内置预设" : "Built-in presets"}</h2>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>{dict.common.provider}</th>
              <th>Base URL</th>
              <th>{zh ? "浏览器直连" : "Browser calls"}</th>
              <th>{zh ? "max tokens 参数" : "Max tokens param"}</th>
              <th>{zh ? "推理参数" : "Reasoning dialects"}</th>
            </tr>
          </thead>
          <tbody>
            {PROVIDER_PRESETS.filter((p) => p.id !== "custom").map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{zh && p.nameZh ? p.nameZh : p.name}</strong>
                  {p.docsUrl ? (
                    <>
                      {" "}
                      <a href={p.docsUrl} target="_blank" rel="noreferrer noopener">
                        docs
                      </a>
                    </>
                  ) : null}
                </td>
                <td>
                  <code>{p.baseUrl}</code>
                  {p.altBaseUrls?.map((a) => (
                    <div key={a.url}>
                      <code>{a.url}</code> <span className="text-xs text-muted">({a.label})</span>
                    </div>
                  ))}
                </td>
                <td>{dict.models.corsBadge[p.cors]}</td>
                <td>
                  <code>{p.maxTokensParam}</code>
                </td>
                <td>{p.reasoningDialects.length ? p.reasoningDialects.map((d) => <code key={d} className="mr-1">{d}</code>) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 id="notes">{zh ? "服务商备注" : "Provider notes"}</h2>
      <ul>
        {PROVIDER_PRESETS.filter((p) => p.notes).map((p) => (
          <li key={p.id}>
            <strong>{zh && p.nameZh ? p.nameZh : p.name}:</strong> {zh ? p.notes!.zh : p.notes!.en}
          </li>
        ))}
      </ul>
      <h2 id="fields">{zh ? "响应字段速查" : "Response field cheat-sheet"}</h2>
      <table>
        <thead>
          <tr>
            <th>{zh ? "信息" : "Information"}</th>
            <th>{zh ? "字段" : "Field"}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{zh ? "可见推理内容" : "Visible reasoning"}</td>
            <td>
              <code>message.reasoning_content</code> (DeepSeek, Qwen, Ark, GLM, Kimi) · <code>message.reasoning</code> (OpenRouter, xAI, Groq) · <code>&lt;think&gt;…&lt;/think&gt;</code> {zh ? "内嵌于 content" : "inside content"} (MiniMax M2, some vLLM/Ollama templates)
            </td>
          </tr>
          <tr>
            <td>{zh ? "隐藏推理的 token 数" : "Hidden reasoning tokens"}</td>
            <td>
              <code>usage.completion_tokens_details.reasoning_tokens</code> (OpenAI)
            </td>
          </tr>
          <tr>
            <td>{zh ? "缓存命中 token" : "Cached prompt tokens"}</td>
            <td>
              <code>usage.prompt_tokens_details.cached_tokens</code> · <code>usage.prompt_cache_hit_tokens</code> (DeepSeek) · <code>usage.cache_read_input_tokens</code>
            </td>
          </tr>
          <tr>
            <td>{zh ? "流式 usage" : "Usage in streams"}</td>
            <td>
              {zh ? "请求" : "request"} <code>stream_options: {"{ include_usage: true }"}</code> → {zh ? "最后一个分块包含" : "last chunk carries"} <code>usage</code>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
