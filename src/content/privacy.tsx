import type { Locale } from "@/i18n/core";
import { REPO_URL } from "@/routes";

export function PrivacyContent({ locale }: { locale: Locale }) {
  if (locale === "zh")
    return (
      <div className="prose-doc">
        <p>
          本站是一个<strong>纯静态网站</strong>：没有任何服务端程序，没有数据库，没有统计埋点，没有 Cookie。你在页面上输入的所有内容——API Key、Base URL、模型列表、测试配置与结果——都<strong>只保存在你自己的浏览器</strong>里。
        </p>
        <h2 id="flow">数据流向</h2>
        <ul>
          <li>
            <strong>请求直接由浏览器发出。</strong>每一次测试请求都由你的浏览器直接发送到你配置的 Base URL（例如 <code>https://api.deepseek.com/v1/chat/completions</code>）。请求不会经过本站的服务器——本站根本没有服务器。
          </li>
          <li>
            <strong>API Key 只发往你配置的地址。</strong>密钥只会作为请求头附加在发往该 Base URL 的请求上。如果你填写了错误的地址，密钥会发往那个地址，请务必核对。
          </li>
          <li>
            <strong>服务商会看到你的 IP。</strong>因为请求由你的设备发出，服务商看到的是你的网络出口 IP，而不是本站的。
          </li>
          <li>
            <strong>没有第三方资源。</strong>页面不加载任何第三方脚本、字体、图片或分析服务；除了你配置的模型接口，页面不会向任何其他域名发起请求。你可以在浏览器开发者工具的“网络”面板中验证这一点。
          </li>
        </ul>
        <h2 id="storage">本地存储</h2>
        <p>本站使用浏览器的 Web Storage 保存以下键（均以 <code>wlcu:</code> 为前缀）：</p>
        <table>
          <thead>
            <tr>
              <th>键</th>
              <th>内容</th>
              <th>位置</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>wlcu:providers</code></td>
              <td>服务商与模型配置（不含密钥）</td>
              <td>localStorage</td>
            </tr>
            <tr>
              <td><code>wlcu:secrets</code></td>
              <td>API Key</td>
              <td>localStorage，或 sessionStorage（关闭“跨会话记住密钥”时，关闭标签页即清除）</td>
            </tr>
            <tr>
              <td><code>wlcu:results</code></td>
              <td>测试记录（含请求 / 响应片段，图片数据会被剔除）</td>
              <td>localStorage</td>
            </tr>
            <tr>
              <td><code>wlcu:settings</code></td>
              <td>主题、语言、偏好</td>
              <td>localStorage</td>
            </tr>
          </tbody>
        </table>
        <p>
          请注意：<strong>localStorage 中的数据以明文保存</strong>，同一台电脑上能访问你浏览器配置文件的人或恶意浏览器扩展可能读取到它。因此我们建议：
        </p>
        <ul>
          <li>使用专门为测试创建、设置了消费上限的 API Key，测完即吊销；</li>
          <li>在共享电脑上关闭“跨会话记住密钥”，或测试结束后点击下方按钮清除全部数据；</li>
          <li>导出配置时选择“不含密钥”的选项，除非你明确需要迁移密钥。</li>
        </ul>
        <h2 id="cors">关于 CORS 与网关</h2>
        <p>
          浏览器只能直接调用允许跨域访问（CORS）的接口。本站<strong>不提供</strong>任何服务端代理来绕过这一限制——那样做会让你的密钥经过第三方服务器。如果某个服务商不支持浏览器直连，你可以在自己控制的环境中部署网关（例如 LiteLLM、One API、Cloudflare AI Gateway）并把它作为自定义 Base URL 使用。
        </p>
        <h2 id="verify">如何验证</h2>
        <ul>
          <li>
            源代码在 <a href={REPO_URL} target="_blank" rel="noreferrer noopener">GitHub</a> 公开，你可以自行审阅或部署到自己的 Cloudflare 账号。
          </li>
          <li>页面通过 Content-Security-Policy 响应头限制只能加载同源脚本与样式，并禁用了 Referrer。</li>
          <li>打开开发者工具 → 网络面板，运行一次测试，你会看到唯一的外部请求就是发往你配置的模型接口。</li>
        </ul>
        <h2 id="contact">联系方式</h2>
        <p>
          如发现安全问题，请在 <a href={`${REPO_URL}/issues`} target="_blank" rel="noreferrer noopener">GitHub Issues</a> 中反馈。
        </p>
      </div>
    );
  return (
    <div className="prose-doc">
      <p>
        This is a <strong>static website</strong>: there is no server-side code, no database, no analytics and no cookies. Everything you type — API keys, base URLs, model lists, test configuration and results — is stored <strong>only in your own browser</strong>.
      </p>
      <h2 id="flow">Where data goes</h2>
      <ul>
        <li>
          <strong>Requests leave directly from your browser.</strong> Every probe is sent by your browser straight to the base URL you configured (for example <code>https://api.deepseek.com/v1/chat/completions</code>). Nothing passes through this site's servers — there are none.
        </li>
        <li>
          <strong>API keys are only sent to the URL you configured.</strong> The key is attached as a request header to calls to that base URL. If you mistype the address, the key goes to that address, so double-check it.
        </li>
        <li>
          <strong>Providers see your IP address</strong>, because the request originates from your device, not from this site.
        </li>
        <li>
          <strong>No third-party resources.</strong> The page loads no external scripts, fonts, images or analytics, and makes no requests to any domain other than the model endpoints you configured. You can verify this in your browser's developer tools (Network tab).
        </li>
      </ul>
      <h2 id="storage">Local storage</h2>
      <p>The site uses Web Storage under the following keys (all prefixed with <code>wlcu:</code>):</p>
      <table>
        <thead>
          <tr>
            <th>Key</th>
            <th>Content</th>
            <th>Location</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>wlcu:providers</code></td>
            <td>Provider and model configuration (no keys)</td>
            <td>localStorage</td>
          </tr>
          <tr>
            <td><code>wlcu:secrets</code></td>
            <td>API keys</td>
            <td>localStorage, or sessionStorage when "remember keys" is off (cleared when the tab closes)</td>
          </tr>
          <tr>
            <td><code>wlcu:results</code></td>
            <td>Test sessions (with request/response excerpts; image payloads are stripped)</td>
            <td>localStorage</td>
          </tr>
          <tr>
            <td><code>wlcu:settings</code></td>
            <td>Theme, language, preferences</td>
            <td>localStorage</td>
          </tr>
        </tbody>
      </table>
      <p>
        Note that <strong>localStorage is stored in plain text</strong>: anyone with access to your browser profile on this computer, or a malicious browser extension, could read it. We therefore recommend:
      </p>
      <ul>
        <li>using a dedicated API key with a spending limit and revoking it when you are done;</li>
        <li>turning "remember keys across sessions" off on shared computers, or wiping all data with the button below;</li>
        <li>exporting configuration without keys unless you explicitly need to migrate them.</li>
      </ul>
      <h2 id="cors">About CORS and gateways</h2>
      <p>
        A browser can only call endpoints that allow cross-origin requests (CORS). This site deliberately <strong>does not</strong> offer a server-side proxy to work around that — it would route your keys through a third party. If a provider blocks browser calls, deploy a gateway you control (LiteLLM, One API, Cloudflare AI Gateway…) and use it as a custom base URL.
      </p>
      <h2 id="verify">How to verify</h2>
      <ul>
        <li>
          The source code is public on <a href={REPO_URL} target="_blank" rel="noreferrer noopener">GitHub</a>; audit it or deploy your own copy to your Cloudflare account.
        </li>
        <li>A Content-Security-Policy header restricts scripts and styles to this origin, and the referrer policy is set to no-referrer.</li>
        <li>Open developer tools → Network, run a test, and observe that the only external requests go to the model endpoints you configured.</li>
      </ul>
      <h2 id="contact">Contact</h2>
      <p>
        Report security issues via <a href={`${REPO_URL}/issues`} target="_blank" rel="noreferrer noopener">GitHub Issues</a>.
      </p>
    </div>
  );
}
