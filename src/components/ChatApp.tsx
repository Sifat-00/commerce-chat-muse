import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Send,
  Paperclip,
  Bot,
  User,
  Moon,
  Sun,
  Plus,
  MessageSquare,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

const N8N_WEBHOOK_URL =
  "https://n8n-f2ty.srv1670697.hstgr.cloud/webhook-test/1fb41601-f306-44eb-8aec-8c2fd4d1187c";

type Role = "user" | "bot";
interface Message {
  id: string;
  role: Role;
  content: string;
  streaming?: boolean;
}
interface Session {
  id: string;
  title: string;
  createdAt: number;
  messages: Message[];
}

const WELCOME = "Hi! How can I help you find products today?";
const STORAGE_KEY = "chat_sessions_v1";
const ACTIVE_KEY = "chat_active_session_v1";

function newSession(): Session {
  return {
    id: "sess_" + Math.random().toString(36).substring(2, 12),
    title: "New chat",
    createdAt: Date.now(),
    messages: [{ id: "welcome", role: "bot", content: WELCOME }],
  };
}

function loadSessions(): Session[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Session[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function sendToWebhook(userMessage: string, sessionId: string): Promise<string> {
  try {
    const res = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatInput: userMessage, sessionId }),
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

export function ChatApp() {
  const [dark, setDark] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Init from localStorage
  useEffect(() => {
    let loaded = loadSessions();
    let active = localStorage.getItem(ACTIVE_KEY) || "";
    if (loaded.length === 0) {
      const s = newSession();
      loaded = [s];
      active = s.id;
    } else if (!loaded.find((s) => s.id === active)) {
      active = loaded[0].id;
    }
    setSessions(loaded);
    setActiveId(active);
    localStorage.setItem("chat_session_id", active);
  }, []);

  // Persist
  useEffect(() => {
    if (sessions.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  }, [sessions]);
  useEffect(() => {
    if (activeId) {
      localStorage.setItem(ACTIVE_KEY, activeId);
      localStorage.setItem("chat_session_id", activeId);
    }
  }, [activeId]);

  const active = useMemo(
    () => sessions.find((s) => s.id === activeId),
    [sessions, activeId],
  );
  const messages = active?.messages ?? [];

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isTyping]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [activeId]);

  const updateActive = (updater: (s: Session) => Session) => {
    setSessions((all) => all.map((s) => (s.id === activeId ? updater(s) : s)));
  };

  const streamBotMessage = (fullText: string) => {
    const id = crypto.randomUUID();
    updateActive((s) => ({
      ...s,
      messages: [...s.messages, { id, role: "bot", content: "", streaming: true }],
    }));
    const words = fullText.split(/(\s+)/);
    let i = 0;
    const tick = () => {
      i++;
      const partial = words.slice(0, i).join("");
      setSessions((all) =>
        all.map((s) =>
          s.id === activeId
            ? {
                ...s,
                messages: s.messages.map((m) =>
                  m.id === id ? { ...m, content: partial } : m,
                ),
              }
            : s,
        ),
      );
      if (i < words.length) {
        setTimeout(tick, 30);
      } else {
        setSessions((all) =>
          all.map((s) =>
            s.id === activeId
              ? {
                  ...s,
                  messages: s.messages.map((m) =>
                    m.id === id ? { ...m, streaming: false } : m,
                  ),
                }
              : s,
          ),
        );
      }
    };
    tick();
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isTyping || !active) return;
    setInput("");
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text };
    const isFirst = active.messages.filter((m) => m.role === "user").length === 0;
    updateActive((s) => ({
      ...s,
      title: isFirst ? text.slice(0, 40) : s.title,
      messages: [...s.messages, userMsg],
    }));
    setIsTyping(true);
    const reply = await sendToWebhook(text, active.id);
    setIsTyping(false);
    streamBotMessage(reply);
  };

  const handleNewChat = () => {
    const s = newSession();
    setSessions((all) => [s, ...all]);
    setActiveId(s.id);
  };

  const handleDelete = (id: string) => {
    setSessions((all) => {
      const remaining = all.filter((s) => s.id !== id);
      if (remaining.length === 0) {
        const s = newSession();
        setActiveId(s.id);
        return [s];
      }
      if (id === activeId) setActiveId(remaining[0].id);
      return remaining;
    });
  };

  return (
    <div className={dark ? "dark" : ""}>
      <div className="flex h-screen w-screen overflow-hidden bg-gradient-to-br from-neutral-50 via-white to-violet-50 text-neutral-900 dark:from-neutral-950 dark:via-neutral-950 dark:to-violet-950/30 dark:text-neutral-100">
        {/* Sidebar */}
        <aside
          className={`${
            sidebarOpen ? "w-72" : "w-0"
          } shrink-0 overflow-hidden border-r border-neutral-200/70 bg-white/60 backdrop-blur-xl transition-all duration-300 dark:border-neutral-800/70 dark:bg-neutral-950/60`}
        >
          <div className="flex h-full w-72 flex-col">
            <div className="flex items-center gap-2 border-b border-neutral-200/70 px-4 py-4 dark:border-neutral-800/70">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-emerald-500 text-white">
                <Bot className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">Shopify AI</p>
                <p className="text-[10px] text-neutral-500">Assistant</p>
              </div>
            </div>

            <div className="p-3">
              <button
                onClick={handleNewChat}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-violet-500 to-emerald-500 px-3 py-2.5 text-sm font-medium text-white shadow-md transition-all hover:scale-[1.02] hover:shadow-lg active:scale-100"
              >
                <Plus className="h-4 w-4" />
                New chat
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-2 pb-2">
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                History
              </p>
              <div className="flex flex-col gap-0.5">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className={`group flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors ${
                      s.id === activeId
                        ? "bg-neutral-200/60 dark:bg-neutral-800/60"
                        : "hover:bg-neutral-100/70 dark:hover:bg-neutral-900/70"
                    }`}
                  >
                    <button
                      onClick={() => setActiveId(s.id)}
                      className="flex flex-1 items-center gap-2 truncate text-left"
                    >
                      <MessageSquare className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
                      <span className="truncate">{s.title}</span>
                    </button>
                    <button
                      onClick={() => handleDelete(s.id)}
                      className="opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                      aria-label="Delete chat"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-neutral-200/70 p-3 dark:border-neutral-800/70">
              <button
                onClick={() => setDark((d) => !d)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-neutral-600 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-900"
              >
                {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                {dark ? "Light mode" : "Dark mode"}
              </button>
            </div>
          </div>
        </aside>

        {/* Main chat */}
        <main className="flex flex-1 flex-col">
          {/* Top bar */}
          <header className="flex items-center gap-3 border-b border-neutral-200/70 bg-white/60 px-4 py-3 backdrop-blur-xl dark:border-neutral-800/70 dark:bg-neutral-950/60">
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="rounded-lg p-2 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-50"
              aria-label="Toggle sidebar"
            >
              {sidebarOpen ? (
                <PanelLeftClose className="h-4 w-4" />
              ) : (
                <PanelLeftOpen className="h-4 w-4" />
              )}
            </button>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold">Shopify AI Assistant</h1>
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Online
              </span>
            </div>
          </header>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
              {messages.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} />
              ))}
              {isTyping && <TypingIndicator />}
            </div>
          </div>

          {/* Composer */}
          <div className="border-t border-neutral-200/70 bg-white/70 px-4 py-4 backdrop-blur-xl dark:border-neutral-800/70 dark:bg-neutral-950/70">
            <div className="mx-auto w-full max-w-3xl">
              <div className="flex items-end gap-2 rounded-2xl border border-neutral-200 bg-white px-3 py-2 shadow-sm focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-400/20 dark:border-neutral-800 dark:bg-neutral-900 dark:focus-within:border-violet-500">
                <button
                  className="mb-1.5 text-neutral-400 transition-colors hover:text-neutral-700 dark:hover:text-neutral-200"
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
                  placeholder="Message Shopify AI…"
                  className="max-h-40 flex-1 resize-none bg-transparent py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none dark:text-neutral-50"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isTyping}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-emerald-500 text-white transition-all hover:scale-105 disabled:cursor-not-allowed disabled:from-neutral-300 disabled:to-neutral-300 disabled:hover:scale-100 dark:disabled:from-neutral-700 dark:disabled:to-neutral-700"
                  aria-label="Send"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-2 text-center text-[10px] text-neutral-400 dark:text-neutral-600">
                Shopify AI can make mistakes. Verify important information.
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex items-start gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isUser
            ? "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
            : "bg-gradient-to-br from-violet-500 to-emerald-500 text-white"
        }`}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
          isUser
            ? "rounded-tr-md bg-gradient-to-br from-violet-500 to-violet-600 text-white"
            : "rounded-tl-md bg-white text-neutral-800 dark:bg-neutral-800/80 dark:text-neutral-100"
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
                const isCta = /buy|shop|view|order|add to cart|checkout|get/i.test(label);
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
              ul: ({ children }) => <ul className="my-1 list-disc pl-4">{children}</ul>,
              ol: ({ children }) => <ol className="my-1 list-decimal pl-4">{children}</ol>,
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
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-emerald-500 text-white">
        <Bot className="h-4 w-4" />
      </div>
      <div className="rounded-2xl rounded-tl-md bg-white px-4 py-3 shadow-sm dark:bg-neutral-800/80">
        <div className="flex items-center gap-1">
          <span className="h-2 w-2 animate-bounce rounded-full bg-neutral-400 [animation-delay:-0.3s] dark:bg-neutral-500" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-neutral-400 [animation-delay:-0.15s] dark:bg-neutral-500" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-neutral-400 dark:bg-neutral-500" />
        </div>
      </div>
    </div>
  );
}
