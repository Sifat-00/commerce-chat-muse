import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  MessageCircle,
  X,
  Send,
  Paperclip,
  Bot,
  User,
  Moon,
  Sun,
} from "lucide-react";

// ============================================================================
// CONFIG: Replace with your n8n Webhook URL
// ============================================================================
const N8N_WEBHOOK_URL = "https://your-n8n-instance.com/webhook/your-webhook-id";

type Role = "user" | "bot";
interface Message {
  id: string;
  role: Role;
  content: string;
  streaming?: boolean;
}

const WELCOME = "Hi! How can I help you find products today?";

async function sendToWebhook(userMessage: string): Promise<string> {
  try {
    const res = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatInput: userMessage }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const data = await res.json();
      return (
        data.output ??
        data.text ??
        data.reply ??
        data.message ??
        data.response ??
        JSON.stringify(data)
      );
    }
    return await res.text();
  } catch (err) {
    console.error("Webhook error:", err);
    return "⚠️ Sorry, I couldn't reach the assistant right now. Please try again in a moment.";
  }
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(true);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: "welcome", role: "bot", content: WELCOME },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isTyping]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 250);
  }, [open]);

  const streamBotMessage = (fullText: string) => {
    const id = crypto.randomUUID();
    setMessages((m) => [...m, { id, role: "bot", content: "", streaming: true }]);
    const words = fullText.split(/(\s+)/);
    let i = 0;
    const tick = () => {
      i++;
      const partial = words.slice(0, i).join("");
      setMessages((m) =>
        m.map((msg) =>
          msg.id === id ? { ...msg, content: partial } : msg,
        ),
      );
      if (i < words.length) {
        setTimeout(tick, 35);
      } else {
        setMessages((m) =>
          m.map((msg) =>
            msg.id === id ? { ...msg, streaming: false } : msg,
          ),
        );
      }
    };
    tick();
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isTyping) return;
    setInput("");
    setMessages((m) => [
      ...m,
      { id: crypto.randomUUID(), role: "user", content: text },
    ]);
    setIsTyping(true);
    const reply = await sendToWebhook(text);
    setIsTyping(false);
    streamBotMessage(reply);
  };

  return (
    <div className={dark ? "dark" : ""}>
      {/* Floating trigger button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open chat"
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-emerald-500 text-white shadow-[0_10px_40px_-10px_rgba(139,92,246,0.6)] transition-all hover:scale-110 hover:shadow-[0_15px_50px_-10px_rgba(139,92,246,0.8)] active:scale-95"
        >
          <MessageCircle className="h-6 w-6" />
          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-neutral-900" />
          </span>
        </button>
      )}

      {/* Chat window */}
      {open && (
        <div
          className="fixed bottom-6 right-6 z-50 flex h-[640px] max-h-[calc(100vh-3rem)] w-[400px] max-w-[calc(100vw-2rem)] origin-bottom-right flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl animate-in fade-in slide-in-from-bottom-4 zoom-in-95 duration-300 dark:border-neutral-800 dark:bg-neutral-950"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-neutral-200 bg-white/80 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80">
            <div className="flex items-center gap-3">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-emerald-500 text-white">
                <Bot className="h-5 w-5" />
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-neutral-950" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                  Shopify AI Assistant
                </h3>
                <p className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Online
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setDark((d) => !d)}
                className="rounded-lg p-2 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-50"
                aria-label="Toggle theme"
              >
                {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-50"
                aria-label="Close chat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto bg-neutral-50/50 px-4 py-4 dark:bg-neutral-900/30"
          >
            <div className="flex flex-col gap-4">
              {messages.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} />
              ))}
              {isTyping && <TypingIndicator />}
            </div>
          </div>

          {/* Composer */}
          <div className="border-t border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950">
            <div className="flex items-end gap-2 rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-2 focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-400/20 dark:border-neutral-800 dark:bg-neutral-900 dark:focus-within:border-violet-500">
              <button
                className="mb-1 text-neutral-400 transition-colors hover:text-neutral-700 dark:hover:text-neutral-200"
                aria-label="Attach file"
                type="button"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                rows={1}
                placeholder="Ask about products…"
                className="max-h-32 flex-1 resize-none bg-transparent text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none dark:text-neutral-50"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isTyping}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-emerald-500 text-white transition-all hover:scale-105 disabled:cursor-not-allowed disabled:from-neutral-300 disabled:to-neutral-300 disabled:hover:scale-100 dark:disabled:from-neutral-700 dark:disabled:to-neutral-700"
                aria-label="Send"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-center text-[10px] text-neutral-400 dark:text-neutral-600">
              Powered by Shopify AI
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div
      className={`flex items-end gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          isUser
            ? "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
            : "bg-gradient-to-br from-violet-500 to-emerald-500 text-white"
        }`}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div
        className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${
          isUser
            ? "rounded-br-md bg-gradient-to-br from-violet-500 to-violet-600 text-white"
            : "rounded-bl-md bg-white text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100"
        }`}
      >
        <div className="prose-chat">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              img: ({ src, alt }) => (
                <img
                  src={src as string}
                  alt={alt || "Product"}
                  className="my-2 w-full max-w-xs rounded-xl border border-black/5 object-cover shadow-md"
                />
              ),
              a: ({ href, children }) => {
                const label = String(children);
                // Style prominent link buttons for shopping CTAs
                const isCta =
                  /buy|shop|view|order|add to cart|checkout|get/i.test(label);
                if (isCta) {
                  return (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2 text-xs font-semibold text-white no-underline shadow-md transition-all hover:scale-105 hover:shadow-lg"
                    >
                      {children} →
                    </a>
                  );
                }
                return (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-violet-500 underline underline-offset-2 hover:text-violet-600"
                  >
                    {children}
                  </a>
                );
              },
              p: ({ children }) => (
                <p className="my-1 first:mt-0 last:mb-0">{children}</p>
              ),
              ul: ({ children }) => (
                <ul className="my-1 list-disc pl-4">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="my-1 list-decimal pl-4">{children}</ol>
              ),
              code: ({ children }) => (
                <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-xs dark:bg-white/10">
                  {children}
                </code>
              ),
              strong: ({ children }) => (
                <strong className="font-semibold">{children}</strong>
              ),
            }}
          >
            {msg.content}
          </ReactMarkdown>
          {msg.streaming && (
            <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-current align-middle" />
          )}
        </div>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-emerald-500 text-white">
        <Bot className="h-4 w-4" />
      </div>
      <div className="rounded-2xl rounded-bl-md bg-white px-4 py-3 shadow-sm dark:bg-neutral-800">
        <div className="flex items-center gap-1">
          <span className="h-2 w-2 animate-bounce rounded-full bg-neutral-400 [animation-delay:-0.3s] dark:bg-neutral-500" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-neutral-400 [animation-delay:-0.15s] dark:bg-neutral-500" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-neutral-400 dark:bg-neutral-500" />
        </div>
      </div>
    </div>
  );
}
