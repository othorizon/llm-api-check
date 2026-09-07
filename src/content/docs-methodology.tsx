import type { Locale } from "@/i18n/core";

export function MethodologyContent({ locale }: { locale: Locale }) {
  if (locale === "zh")
    return (
      <div className="prose-doc">
        <p>本页说明性能测试如何测量、提示词如何随机化，以及场景评分如何计算。所有测量都在你的浏览器中完成，因此数字包含了你到服务商之间的网络往返——这正是你的用户会感受到的延迟。</p>
        <h2 id="timing">计时方式</h2>
        <p>
          每个请求都用 <code>performance.now()</code> 计时，从调用 <code>fetch()</code> 开始，到响应体读取完毕结束。流式请求逐块解析 SSE（Server-Sent Events），并记录以下时间点：
        </p>
        <table>
          <thead>
            <tr>
              <th>指标</th>
              <th>定义</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>TTFT</strong>（首 token 延迟）</td>
              <td>第一个携带任何增量（<code>content</code>、<code>reasoning_content</code>、<code>reasoning</code>、<code>tool_calls</code>）的 SSE 分块到达的时间。</td>
            </tr>
            <tr>
              <td><strong>首内容 token</strong>（TTF content）</td>
              <td>第一个携带可见 <code>content</code> 的分块到达的时间；<code>&lt;think&gt;</code> 标签内的文字按推理处理。对语音、聊天等场景，这才是用户能感知的“开始回答”。</td>
            </tr>
            <tr>
              <td><strong>总耗时</strong></td>
              <td>从发起请求到流结束（或非流式响应完整到达）。</td>
            </tr>
            <tr>
              <td><strong>解码 tok/s</strong></td>
              <td><code>(completion_tokens − 1) / (总耗时 − TTFT)</code>：首 token 之后的生成速度，排除排队与 prefill 时间。仅流式可测。</td>
            </tr>
            <tr>
              <td><strong>端到端 tok/s</strong></td>
              <td><code>completion_tokens / 总耗时</code>：包含排队、prefill 与网络的整体速度。非流式模式只有这一项吞吐指标。</td>
            </tr>
          </tbody>
        </table>
        <p>
          token 数优先取自响应中的 <code>usage</code>（流式请求会发送 <code>stream_options: {"{ include_usage: true }"}</code>；若接口拒绝该参数会自动去掉重试）。没有 usage 时按字符估算（CJK 约 1 字 1 token，拉丁文约 4 字符 1 token），并在界面中以 <strong>≈</strong> 标注。推理模型的 <code>completion_tokens</code> 通常包含推理 token，因此吞吐按全部生成 token 计算。
        </p>
        <h2 id="cache">提示词缓存：不命中 / 命中 / 对比</h2>
        <p>服务商的前缀缓存会让重复请求的 TTFT 骤降，同一份提示词跑出来的数字和真实的首次请求相差很大。因此性能测试提供三种缓存条件：</p>
        <table>
          <thead>
            <tr>
              <th>条件</th>
              <th>提示词</th>
              <th>预热</th>
              <th>适用</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>不命中缓存</strong>（默认）</td>
              <td>每次请求的 system 消息<strong>最开头</strong>都带当前时间戳与随机串（前缀缓存按前缀匹配，开头不同即无法命中）；写作主题和填充文本也随机。</td>
              <td>无</td>
              <td>用户每次都发新内容的场景，例如聊天首轮、批处理。</td>
            </tr>
            <tr>
              <td><strong>命中缓存</strong></td>
              <td>本次会话内为每个模型固定一份提示词（含一个会话级随机串，保证与以往请求不同），所有请求逐字节相同。</td>
              <td>先发一次不计入统计的预热请求，等待“预热后等待”毫秒数让服务商建立缓存，再开始计入统计的运行。</td>
              <td>长 system 提示词、RAG 上下文、Agent 多轮循环等复用前缀的场景。</td>
            </tr>
            <tr>
              <td><strong>两者对比</strong></td>
              <td>先按“不命中”跑一组，再按“命中”跑一组。</td>
              <td>命中组前预热一次。</td>
              <td>想知道缓存到底能带来多少延迟收益。</td>
            </tr>
          </tbody>
        </table>
        <p>
          命中与否以服务商在 usage 中返回的缓存字段为准：<code>prompt_tokens_details.cached_tokens</code>（OpenAI、通义千问、火山方舟、Kimi 等）、<code>prompt_cache_hit_tokens</code>（DeepSeek）、<code>cache_read_input_tokens</code>（Anthropic 风格网关）。表格中的“缓存命中”列显示命中 token 占输入 token 的比例；不命中组若出现命中会以警示色标出。多数服务商只缓存达到一定长度的前缀（OpenAI ≥ 1,024 tokens），所以测命中时请选择“长”输入长度。
        </p>
        <p>运行顺序为<strong>跨模型轮转</strong>（A、B、C、A、B、C…），以减少时段性波动对某一个模型的偏向。场景评分默认基于不命中组；只跑命中组时会在评分依据中注明。</p>
        <h2 id="scores">场景评分</h2>
        <p>评分是把测得的中位数映射到 0–100 的分段线性函数，再叠加尾延迟、吞吐与失败的惩罚。等级：A ≥ 85，B ≥ 70，C ≥ 55，D ≥ 40，其余 F。评分只是把数字翻译成可读的结论，具体阈值如下：</p>
        <table>
          <thead>
            <tr>
              <th>场景</th>
              <th>主要指标</th>
              <th>满分 / 及格参考</th>
              <th>惩罚项</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>实时语音对话</td>
              <td>首内容 token p50（流式）</td>
              <td>≤ 250 ms 满分；500 ms ≈ 88；800 ms ≈ 70；1.2 s ≈ 48；2 s ≈ 22；≥ 4 s 为 0</td>
              <td>p95 &gt; max(1.2 s, 2×p50) −12；解码 &lt; 15 tok/s −10，&lt; 8 tok/s −30；每次失败 −20</td>
            </tr>
            <tr>
              <td>交互式聊天</td>
              <td>首内容 token p50 与解码 tok/s</td>
              <td>≤ 400 ms 满分，1 s ≈ 88，2 s ≈ 68，4 s ≈ 40；吞吐 50 tok/s 满分、30 ≈ 90、15 ≈ 70（权重 35%）</td>
              <td>每次失败 −20</td>
            </tr>
            <tr>
              <td>Agent / 编码循环</td>
              <td>解码 tok/s（无流式时用端到端）</td>
              <td>120 tok/s 满分，80 ≈ 95，50 ≈ 82，30 ≈ 62，15 ≈ 35</td>
              <td>TTFT 超过 1 s 每秒 −10（最多 −30）；每次失败 −20</td>
            </tr>
            <tr>
              <td>批处理</td>
              <td>端到端 tok/s（优先非流式）</td>
              <td>80 tok/s 满分，40 ≈ 88，20 ≈ 70，10 ≈ 45</td>
              <td>每次失败 −30</td>
            </tr>
          </tbody>
        </table>
        <p>
          语音场景的阈值来自常见的语音助手延迟预算：从用户说完到助手开口约 800 ms–1 s，其中 ASR、网络与 TTS 首包各占一部分，留给 LLM 首 token 的通常只有 300–500 ms。语速约每秒 2–4 个词（3–6 tokens），因此 15 tok/s 以上的吞吐已足够“说得比听得快”。若模型在可见内容之前先进行推理，评分会提示你关闭思考。
        </p>
        <h2 id="caveats">注意事项</h2>
        <ul>
          <li>数字包含你的网络状况；跨地区测试时请注意对比基准。</li>
          <li>次数越多，p50 / p95 越稳定；建议每种模式至少 5 次。</li>
          <li>不同服务商对 <code>max_tokens</code> 的截断方式不同，短输出会让吞吐估计偏低。</li>
          <li>本站不做并发压测：所有请求串行发送，以保证测量互不干扰。</li>
        </ul>
      </div>
    );
  return (
    <div className="prose-doc">
      <p>This page explains how the performance test measures latency and throughput, how prompts are randomised, and how scenario scores are computed. Everything is measured in your browser, so the numbers include the network round-trip between you and the provider — which is exactly what your users experience.</p>
      <h2 id="timing">How timing works</h2>
      <p>
        Each request is timed with <code>performance.now()</code> from the <code>fetch()</code> call until the body has been fully read. Streaming requests parse Server-Sent Events chunk by chunk and record these points:
      </p>
      <table>
        <thead>
          <tr>
            <th>Metric</th>
            <th>Definition</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>TTFT</strong> (time to first token)</td>
            <td>Arrival of the first SSE chunk carrying any delta: <code>content</code>, <code>reasoning_content</code>, <code>reasoning</code> or <code>tool_calls</code>.</td>
          </tr>
          <tr>
            <td><strong>TTF content</strong></td>
            <td>Arrival of the first chunk with visible <code>content</code>; text inside <code>&lt;think&gt;</code> tags counts as reasoning. For voice and chat this is the moment the user perceives an answer starting.</td>
          </tr>
          <tr>
            <td><strong>Total</strong></td>
            <td>From request start to the end of the stream (or the complete non-streaming response).</td>
          </tr>
          <tr>
            <td><strong>Decode tok/s</strong></td>
            <td><code>(completion_tokens − 1) / (total − TTFT)</code>: generation speed once tokens start flowing, excluding queueing and prefill. Streaming only.</td>
          </tr>
          <tr>
            <td><strong>End-to-end tok/s</strong></td>
            <td><code>completion_tokens / total</code>: overall speed including queueing, prefill and network. The only throughput figure available for non-streaming calls.</td>
          </tr>
        </tbody>
      </table>
      <p>
        Token counts come from the response <code>usage</code> when available (streaming requests send <code>stream_options: {"{ include_usage: true }"}</code> and retry without it if rejected). When usage is missing, tokens are estimated from characters (≈1 token per CJK character, ≈4 Latin characters per token) and flagged with <strong>≈</strong> in the UI. For reasoning models <code>completion_tokens</code> usually includes reasoning tokens, so throughput counts every generated token.
      </p>
      <h2 id="cache">Prompt cache: miss, hit, or compare</h2>
      <p>Provider-side prefix caching makes repeated requests dramatically faster, so a benchmark that reuses one prompt looks nothing like a real first request. The performance test therefore offers three cache conditions:</p>
      <table>
        <thead>
          <tr>
            <th>Condition</th>
            <th>Prompt</th>
            <th>Warm-up</th>
            <th>Use it for</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Cache miss</strong> (default)</td>
            <td>Every request starts its system message with the current timestamp and a random token (prefix caches match from the beginning, so a different start cannot hit); the topic and filler text are random too.</td>
            <td>None</td>
            <td>Workloads where every request is new: first chat turns, batch jobs.</td>
          </tr>
          <tr>
            <td><strong>Cache hit</strong></td>
            <td>One prompt per model is fixed for the session (with a session-level random token so it differs from earlier sessions); every request is byte-identical.</td>
            <td>One unmeasured warm-up request, then a pause (“wait after warm-up”) so the provider can build the cache, then the measured runs.</td>
            <td>Long system prompts, RAG contexts, agent loops — anything that reuses a prefix.</td>
          </tr>
          <tr>
            <td><strong>Compare both</strong></td>
            <td>Runs the cache-miss block, then the cache-hit block.</td>
            <td>Once, before the hit block.</td>
            <td>Quantifying how much latency the cache actually saves.</td>
          </tr>
        </tbody>
      </table>
      <p>
        Whether a request hit is read from the provider's usage fields: <code>prompt_tokens_details.cached_tokens</code> (OpenAI, Qwen, Ark, Kimi…), <code>prompt_cache_hit_tokens</code> (DeepSeek), <code>cache_read_input_tokens</code> (Anthropic-style gateways). The “Cached” column shows cached tokens as a share of prompt tokens; a hit inside the miss block is flagged in a warning colour. Most providers only cache prefixes above a minimum length (OpenAI ≥ 1,024 tokens), so pick the long input size when measuring hits.
      </p>
      <p>Requests are scheduled <strong>round-robin across models</strong> (A, B, C, A, B, C…) so that time-of-day variance does not favour one model. Scenario scores use the cache-miss runs; when only the hit block was run, the score notes say so.</p>
      <h2 id="scores">Scenario scores</h2>
      <p>A score maps the measured medians through a piecewise-linear curve to 0–100 and subtracts penalties for tail latency, low throughput and failures. Grades: A ≥ 85, B ≥ 70, C ≥ 55, D ≥ 40, otherwise F. Scores only translate numbers into a readable verdict; the thresholds are:</p>
      <table>
        <thead>
          <tr>
            <th>Scenario</th>
            <th>Primary metric</th>
            <th>Curve</th>
            <th>Penalties</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Real-time voice</td>
            <td>TTF content p50 (streaming)</td>
            <td>≤ 250 ms → 100; 500 ms → 88; 800 ms → 70; 1.2 s → 48; 2 s → 22; ≥ 4 s → 0</td>
            <td>p95 &gt; max(1.2 s, 2×p50): −12; decode &lt; 15 tok/s −10, &lt; 8 tok/s −30; −20 per failed run</td>
          </tr>
          <tr>
            <td>Interactive chat</td>
            <td>TTF content p50 and decode tok/s</td>
            <td>≤ 400 ms → 100, 1 s → 88, 2 s → 68, 4 s → 40; throughput 50 tok/s → 100, 30 → 90, 15 → 70 (35% weight)</td>
            <td>−20 per failed run</td>
          </tr>
          <tr>
            <td>Agent / coding loops</td>
            <td>Decode tok/s (end-to-end when no streaming run)</td>
            <td>120 tok/s → 100, 80 → 95, 50 → 82, 30 → 62, 15 → 35</td>
            <td>−10 per second of TTFT above 1 s (max −30); −20 per failed run</td>
          </tr>
          <tr>
            <td>Batch processing</td>
            <td>End-to-end tok/s (non-streaming preferred)</td>
            <td>80 tok/s → 100, 40 → 88, 20 → 70, 10 → 45</td>
            <td>−30 per failed run</td>
          </tr>
        </tbody>
      </table>
      <p>
        The voice thresholds follow common voice-assistant latency budgets: roughly 800 ms–1 s from the end of the user's speech to the assistant's first audible word, shared between ASR, network and TTS first-byte, which leaves about 300–500 ms for the LLM's first token. Speech runs at 2–4 words (3–6 tokens) per second, so anything above ~15 tok/s comfortably outpaces playback. When a model reasons before its first visible token, the score points that out so you can disable thinking.
      </p>
      <h2 id="caveats">Caveats</h2>
      <ul>
        <li>Numbers include your own network path; compare against a baseline when testing across regions.</li>
        <li>More runs give more stable p50/p95 values — five or more per mode is a good minimum.</li>
        <li>Providers truncate at <code>max_tokens</code> differently; very short outputs under-estimate throughput.</li>
        <li>There is no load testing: requests are sent one at a time so measurements do not interfere.</li>
      </ul>
    </div>
  );
}
