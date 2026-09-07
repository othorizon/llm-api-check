import type { Locale } from "@/i18n/core";
import { getDict, testInfo } from "@/i18n";
import { SUITE_ORDER, suiteTests } from "@/lib/caps/registry";
import { REASONING_DIALECTS } from "@/lib/caps/reasoning-dialects";

function LangChainSection({ locale }: { locale: Locale }) {
  const py = `# Python — langchain-openai
llm = ChatOpenAI(model="...")
structured = llm.with_structured_output(Person)             # method="function_calling" by default for most models
# -> tools=[Person schema], tool_choice={"type":"function","function":{"name":"Person"}}
structured = llm.with_structured_output(Person, method="json_schema")
# -> response_format={"type":"json_schema","json_schema":{...,"strict":True}}
structured = llm.with_structured_output(Person, method="json_mode")
# -> response_format={"type":"json_object"}

# Generic BaseChatModel.with_structured_output (inherited by many integrations)
llm.bind_tools([Person], tool_choice="any")                 # "any" -> "required" on OpenAI-style APIs`;
  const js = `// JavaScript — @langchain/openai
const structured = model.withStructuredOutput(schema);        // functionCalling by default
// -> tools: [schema], tool_choice: { type: "function", function: { name } }
model.withStructuredOutput(schema, { method: "jsonSchema" }); // response_format json_schema
model.withStructuredOutput(schema, { method: "jsonMode" });   // response_format json_object`;
  if (locale === "zh")
    return (
      <>
        <h2 id="langchain">LangChain 的结构化输出会发送什么</h2>
        <p>
          LangChain 的 <code>with_structured_output()</code>（Python）与 <code>withStructuredOutput()</code>（JS）默认使用 <strong>function_calling</strong> 方法：把你的 schema 注册为一个工具，并<strong>强制</strong>模型调用它。强制的方式取决于集成类：
        </p>
        <ul>
          <li><code>ChatOpenAI</code> 及其子类（ChatDeepSeek、ChatXAI 等多数“OpenAI 兼容”集成）发送<strong>指定函数名</strong>的 <code>tool_choice</code>（对应“强制指定函数”探测）。</li>
          <li>通用的 <code>BaseChatModel.with_structured_output</code>（社区集成、ChatTongyi、ChatZhipuAI、许多第三方包）调用 <code>bind_tools(tool_choice="any")</code>，OpenAI 风格接口会把 <code>"any"</code> 翻译成 <code>"required"</code>（对应“强制调用（required）”探测）。</li>
          <li><code>method="json_schema"</code> 走 <code>response_format: json_schema</code>（strict）；<code>method="json_mode"</code> 走 <code>response_format: json_object</code>。</li>
          <li>LangGraph 的 <code>create_react_agent(response_format=…)</code> 在最后一步用同样的 <code>with_structured_output</code> 生成结构化回复。</li>
        </ul>
        <p>如果接口忽略 <code>tool_choice</code>，模型可能用文本回答，解析结果为 <code>None</code>；如果接口拒绝它，你会看到 HTTP 400。工具调用套件中的三个 tool_choice 探测正是为了在集成之前发现这些问题。</p>
        <pre>
          <code>{py}</code>
        </pre>
        <pre>
          <code>{js}</code>
        </pre>
      </>
    );
  return (
    <>
      <h2 id="langchain">What LangChain structured output actually sends</h2>
      <p>
        LangChain's <code>with_structured_output()</code> (Python) and <code>withStructuredOutput()</code> (JS) default to the <strong>function_calling</strong> method: your schema is registered as a tool and the model is <strong>forced</strong> to call it. How it is forced depends on the integration class:
      </p>
      <ul>
        <li><code>ChatOpenAI</code> and its subclasses (ChatDeepSeek, ChatXAI and most “OpenAI-compatible” integrations) send a <strong>named</strong> <code>tool_choice</code> — the “forced named tool” probe.</li>
        <li>The generic <code>BaseChatModel.with_structured_output</code> (community integrations, ChatTongyi, ChatZhipuAI, many third-party packages) calls <code>bind_tools(tool_choice="any")</code>, which OpenAI-style APIs translate to <code>"required"</code> — the “forced tool call (required)” probe.</li>
        <li><code>method="json_schema"</code> uses <code>response_format: json_schema</code> (strict); <code>method="json_mode"</code> uses <code>response_format: json_object</code>.</li>
        <li>LangGraph's <code>create_react_agent(response_format=…)</code> runs the same <code>with_structured_output</code> for its final structured answer.</li>
      </ul>
      <p>If an endpoint ignores <code>tool_choice</code>, the model may answer in prose and parsing returns <code>None</code>; if it rejects it, you get HTTP 400. The three tool_choice probes in the tool-calling suite exist to catch exactly this before you integrate.</p>
      <pre>
        <code>{py}</code>
      </pre>
      <pre>
        <code>{js}</code>
      </pre>
    </>
  );
}

export function CapabilitiesDocsContent({ locale }: { locale: Locale }) {
  const dict = getDict(locale);
  const zh = locale === "zh";
  return (
    <div className="prose-doc">
      <p>
        {zh
          ? "能力测试与消息格式测试由一组小型“探测”组成：每个探测发送一个精心构造的请求，并根据响应给出结论。结论分为五类："
          : "The capability and message-format tests are made of small probes: each sends one carefully constructed request and derives a verdict from the response. Verdicts fall into five classes:"}
      </p>
      <ul>
        {(["pass", "partial", "fail", "unsupported", "error", "skipped"] as const).map((s) => (
          <li key={s}>
            <strong>{dict.status[s]}</strong> — {dict.statusLong[s]}
          </li>
        ))}
      </ul>
      <p>
        {zh
          ? "“被拒绝”与“不支持”的区别很重要：前者是接口以 HTTP 4xx 明确拒绝（通常是不认识的参数），后者是接口接受了请求但模型没有按预期行为。很多 OpenAI 兼容接口会静默忽略未知参数，所以“接受”不等于“生效”——探测会尽量验证实际效果。"
          : "The distinction between “Rejected” and “No” matters: the former is an explicit HTTP 4xx from the endpoint (usually an unknown parameter), the latter means the request was accepted but the model did not behave as expected. Many OpenAI-compatible endpoints silently ignore unknown parameters, so “accepted” never implies “effective” — each probe verifies the observable effect where it can."}
      </p>
      <h2 id="dialects">{zh ? "推理开关的参数写法" : "Reasoning toggle dialects"}</h2>
      <p>{zh ? "“关闭（或开启）推理”探测会逐一尝试下列写法，每种写法单独一个请求：" : "The “turn reasoning off (or on)” probe tries each of these dialects in its own request:"}</p>
      <div className="overflow-x-auto">
      <table className="whitespace-nowrap">
        <thead>
          <tr>
            <th>{zh ? "写法" : "Dialect"}</th>
            <th>{zh ? "关闭" : "Disable"}</th>
            <th>{zh ? "开启" : "Enable"}</th>
            <th>{zh ? "使用者" : "Used by"}</th>
          </tr>
        </thead>
        <tbody>
          {REASONING_DIALECTS.map((d) => (
            <tr key={d.id}>
              <td><code>{d.id}</code></td>
              <td><code>{JSON.stringify(d.disable)}</code></td>
              <td><code>{JSON.stringify(d.enable)}</code></td>
              <td className="whitespace-normal">{d.vendors}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <LangChainSection locale={locale} />
      {SUITE_ORDER.map((suite) => (
        <section key={suite}>
          <h2 id={suite}>{dict.caps.suiteInfo[suite].name}</h2>
          <p>{dict.caps.suiteInfo[suite].desc}</p>
          {suiteTests(suite).map((test) => {
            const info = testInfo(dict, test.id);
            return (
              <div key={test.id}>
                <h3 id={test.id.replace(".", "-")}>
                  {info.name} <code className="ml-1 text-[11px]">{test.id}</code>
                </h3>
                <p>{info.desc}</p>
                <p>
                  <strong>{dict.common.why}:</strong> {info.why}
                </p>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
