import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import {
  Send,
  Paperclip,
  Sparkles,
  User,
  Moon,
  Sun,
  Plus,
  MessageSquare,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from "lucide-react";

const N8N_WEBHOOK_URL =
  "https://n8n-f2ty.srv1670697.hstgr.cloud/webhook-test/4a4bbb56-7aa2-4f24-94fe-959cacf324f9";

type Role = "user" | "bot";
interface Message {
  id: string;
  role: Role;
  content: string;
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

/* ---------------- Parsing: split into text blocks + image-carousel blocks ---------------- */

type Block =
  | { kind: "text"; content: string }
  | { kind: "carousel"; items: { src: string; alt: string; href?: string }[] };

const IMG_RE = /!\[([^\]]*)\]\(([^)]+)\)(?:\s*\[([^\]]+)\]\(([^)]+)\))?/g;

function parseBlocks(md: string): Block[] {
  // Find image runs (2+ consecutive images become a carousel).
  const lines = md.split(/\n+/);
  const blocks: Block[] = [];
  let textBuf: string[] = [];
  let imgBuf: { src: string; alt: string; href?: string }[] = [];

  const flushText = () => {
    if (textBuf.length) {
      blocks.push({ kind: "text", content: textBuf.join("\n") });
      textBuf = [];
    }
  };
  const flushImgs = () => {
    if (imgBuf.length >= 2) {
      blocks.push({ kind: "carousel", items: imgBuf });
    } else if (imgBuf.length === 1) {
      const i = imgBuf[0];
      const linkPart = i.href ? ` [Buy Now](${i.href})` : "";
      textBuf.push(`![${i.alt}](${i.src})${linkPart}`);
    }
    imgBuf = [];
  };

  for (const line of lines) {
    IMG_RE.lastIndex = 0;
    const matches = [...line.matchAll(IMG_RE)];
    const stripped = line.replace(IMG_RE, "").trim();
    if (matches.length && !stripped) {
      for (const m of matches) {
        imgBuf.push({ alt: m[1] || "Product", src: m[2], href: m[4] });
      }
    } else {
      flushImgs();
      textBuf.push(line);
    }
  }
  flushImgs();
  flushText();
  return blocks;
}

/* -------------------------------- Component -------------------------------- */

export function ChatApp() {
  const [dark, setDark] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  // Streaming overlay: rendered on top of the persisted message without
  // rewriting `sessions` on every tick (this is what caused the lag).
  const [streaming, setStreaming] = useState<{ id: string; text: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const streamTimer = useRef<number | null>(null);

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

  const scrollToBottom = useCallback((smooth = true) => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, isTyping, scrollToBottom]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [activeId]);

  const updateActive = (updater: (s: Session) => Session) => {
    setSessions((all) => all.map((s) => (s.id === activeId ? updater(s) : s)));
  };

  const streamBotMessage = (fullText: string) => {
    const id = crypto.randomUUID();
    // Insert an empty placeholder message once.
    updateActive((s) => ({
      ...s,
      messages: [...s.messages, { id, role: "bot", content: "" }],
    }));
    setStreaming({ id, text: "" });

    const tokens = fullText.split(/(\s+)/);
    let i = 0;
    const tick = () => {
      i = Math.min(tokens.length, i + 2);
      const partial = tokens.slice(0, i).join("");
      setStreaming({ id, text: partial });
      if (i < tokens.length) {
        streamTimer.current = window.setTimeout(tick, 20);
      } else {
        // Commit once at end.
        setSessions((all) =>
          all.map((s) =>
            s.id === activeId
              ? {
                  ...s,
                  messages: s.messages.map((m) =>
                    m.id === id ? { ...m, content: fullText } : m,
                  ),
                }
              : s,
          ),
        );
        setStreaming(null);
      }
    };
    tick();
  };

  useEffect(() => () => {
    if (streamTimer.current) window.clearTimeout(streamTimer.current);
  }, []);

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
      <div className="relative flex h-screen w-screen overflow-hidden bg-neutral-50 text-neutral-900 dark:bg-[#0a0a0f] dark:text-neutral-100">
        {/* Ambient background */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-violet-500/20 blur-3xl dark:bg-violet-600/25" />
          <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-emerald-500/15 blur-3xl dark:bg-emerald-500/20" />
          <div className="absolute top-1/2 left-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-fuchsia-500/5 blur-3xl dark:bg-fuchsia-500/10" />
        </div>

        {/* Sidebar */}
        <aside
          className={`${
            sidebarOpen ? "w-72" : "w-0"
          } relative z-10 shrink-0 overflow-hidden border-r border-neutral-200/60 bg-white/70 backdrop-blur-2xl transition-all duration-300 dark:border-white/5 dark:bg-white/[0.02]`}
        >
          <div className="flex h-full w-72 flex-col">
            <div className="flex items-center gap-3 border-b border-neutral-200/60 px-4 py-4 dark:border-white/5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-emerald-500 text-white shadow-lg shadow-violet-500/30 animate-gradient">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold tracking-tight">Shopify AI</p>
                <p className="text-[10px] text-neutral-500">Premium Assistant</p>
              </div>
            </div>

            <div className="p-3">
              <button
                onClick={handleNewChat}
                className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-emerald-500 px-3 py-2.5 text-sm font-medium text-white shadow-lg shadow-violet-500/25 transition-all hover:shadow-violet-500/40 active:scale-[0.98] animate-gradient"
              >
                <Plus className="h-4 w-4 transition-transform group-hover:rotate-90" />
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
                    className={`group flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition-all ${
                      s.id === activeId
                        ? "bg-gradient-to-r from-violet-500/15 to-emerald-500/10 ring-1 ring-violet-500/20 dark:from-violet-500/20 dark:to-emerald-500/10"
                        : "hover:bg-neutral-100/70 dark:hover:bg-white/[0.04]"
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

            <div className="border-t border-neutral-200/60 p-3 dark:border-white/5">
              <button
                onClick={() => setDark((d) => !d)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-neutral-600 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-white/[0.04]"
              >
                {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                {dark ? "Light mode" : "Dark mode"}
              </button>
            </div>
          </div>
        </aside>

        {/* Main chat */}
        <main className="relative z-10 flex flex-1 flex-col">
          {/* Top bar */}
          <header className="flex items-center gap-3 border-b border-neutral-200/60 bg-white/60 px-4 py-3 backdrop-blur-2xl dark:border-white/5 dark:bg-white/[0.02]">
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="rounded-lg p-2 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-white/[0.05] dark:hover:text-neutral-50"
              aria-label="Toggle sidebar"
            >
              {sidebarOpen ? (
                <PanelLeftClose className="h-4 w-4" />
              ) : (
                <PanelLeftOpen className="h-4 w-4" />
              )}
            </button>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold tracking-tight">Shopify AI Assistant</h1>
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </span>
                Online
              </span>
            </div>
          </header>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  streamingText={
                    streaming && streaming.id === msg.id ? streaming.text : null
                  }
                  onImagesLoaded={() => scrollToBottom(false)}
                />
              ))}
              {isTyping && <TypingIndicator />}
            </div>
          </div>

          {/* Composer */}
          <div className="border-t border-neutral-200/60 bg-white/60 px-4 py-4 backdrop-blur-2xl dark:border-white/5 dark:bg-white/[0.02]">
            <div className="mx-auto w-full max-w-3xl">
              <div className="group flex items-end gap-2 rounded-2xl border border-neutral-200 bg-white px-3 py-2 shadow-sm transition-all focus-within:border-violet-400 focus-within:shadow-lg focus-within:shadow-violet-500/10 focus-within:ring-2 focus-within:ring-violet-400/20 dark:border-white/10 dark:bg-white/[0.04] dark:focus-within:border-violet-500/50">
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
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-emerald-500 text-white shadow-md transition-all hover:scale-110 hover:rotate-[-8deg] active:scale-95 disabled:cursor-not-allowed disabled:from-neutral-300 disabled:to-neutral-300 disabled:hover:scale-100 disabled:hover:rotate-0 dark:disabled:from-neutral-700 dark:disabled:to-neutral-700 ${
                    input.trim() && !isTyping ? "animate-send-pulse animate-gradient" : ""
                  }`}
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

/* ------------------------------- Message UI ------------------------------- */

function MessageBubble({
  msg,
  streamingText,
  onImagesLoaded,
}: {
  msg: Message;
  streamingText: string | null;
  onImagesLoaded: () => void;
}) {
  const isUser = msg.role === "user";
  const content = streamingText !== null ? streamingText : msg.content;
  const isStreaming = streamingText !== null;

  const blocks = useMemo(
    () => (isUser ? [{ kind: "text" as const, content }] : parseBlocks(content)),
    [content, isUser],
  );

  return (
    <div
      className={`flex items-start gap-3 animate-msg-in ${
        isUser ? "flex-row-reverse" : "flex-row"
      }`}
    >
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full shadow-md ${
          isUser
            ? "bg-neutral-200 text-neutral-700 dark:bg-white/10 dark:text-neutral-200"
            : "bg-gradient-to-br from-violet-500 via-fuchsia-500 to-emerald-500 text-white animate-gradient"
        }`}
      >
        {isUser ? <User className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
      </div>
      <div
        className={`min-w-0 max-w-[85%] ${
          isUser
            ? "rounded-2xl rounded-tr-md bg-gradient-to-br from-violet-500 to-violet-600 px-4 py-3 text-sm text-white shadow-lg shadow-violet-500/20"
            : "rounded-2xl rounded-tl-md bg-white/80 px-4 py-3 text-sm text-neutral-800 shadow-sm ring-1 ring-black/[0.03] backdrop-blur-xl dark:bg-white/[0.04] dark:text-neutral-100 dark:ring-white/5"
        }`}
      >
        <div className="prose-chat space-y-2">
          {blocks.map((b, idx) =>
            b.kind === "carousel" ? (
              <ProductCarousel key={idx} items={b.items} onLoaded={onImagesLoaded} />
            ) : (
              <TextBlock key={idx} content={b.content} />
            ),
          )}
          {isStreaming && (
            <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-caret bg-current align-middle" />
          )}
        </div>
      </div>
    </div>
  );
}

function TextBlock({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      components={{
        img: ({ src, alt }) => (
          <img
            src={src as string}
            alt={alt || "Product"}
            loading="lazy"
            className="my-2 w-full max-w-xs rounded-xl border border-black/5 object-cover shadow-md animate-card-slide-in"
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
                className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2 text-xs font-semibold text-white no-underline shadow-md shadow-emerald-500/30 transition-all hover:scale-105 hover:shadow-lg hover:shadow-emerald-500/40"
              >
                {children} <ExternalLink className="h-3 w-3" />
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
        p: ({ children }) => <p className="my-1 whitespace-pre-wrap first:mt-0 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="my-1 list-disc pl-4">{children}</ul>,
        ol: ({ children }) => <ol className="my-1 list-decimal pl-4">{children}</ol>,
        code: ({ children }) => (
          <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-xs dark:bg-white/10">
            {children}
          </code>
        ),
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

/* ------------------------------ Product carousel ------------------------------ */

function ProductCarousel({
  items,
  onLoaded,
}: {
  items: { src: string; alt: string; href?: string }[];
  onLoaded: () => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canL, setCanL] = useState(false);
  const [canR, setCanR] = useState(false);

  const updateArrows = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanL(el.scrollLeft > 4);
    setCanR(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateArrows();
    const el = scrollerRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateArrows, { passive: true });
    return () => el.removeEventListener("scroll", updateArrows);
  }, [updateArrows, items.length]);

  const scrollBy = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * (el.clientWidth * 0.85), behavior: "smooth" });
  };

  return (
    <div className="relative my-2 -mx-1">
      <div
        ref={scrollerRef}
        className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-1 pb-1"
      >
        {items.map((it, i) => (
          <a
            key={i}
            href={it.href || it.src}
            target="_blank"
            rel="noopener noreferrer"
            style={{ animationDelay: `${Math.min(i, 6) * 70}ms` }}
            className="group relative flex w-52 shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-black/5 bg-white shadow-md ring-1 ring-black/[0.02] transition-all hover:-translate-y-1 hover:shadow-xl hover:ring-violet-500/30 dark:border-white/5 dark:bg-white/[0.04] dark:ring-white/5 animate-card-slide-in"
          >
            <div className="aspect-square w-full overflow-hidden bg-neutral-100 dark:bg-white/[0.03]">
              <img
                src={it.src}
                alt={it.alt}
                loading="lazy"
                onLoad={onLoaded}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
              />
            </div>
            <div className="flex flex-col gap-1 p-2.5">
              <p className="line-clamp-2 text-xs font-medium leading-snug text-neutral-800 dark:text-neutral-100">
                {it.alt}
              </p>
              {it.href && (
                <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 px-2.5 py-1 text-[10px] font-semibold text-white shadow-sm">
                  View <ExternalLink className="h-2.5 w-2.5" />
                </span>
              )}
            </div>
          </a>
        ))}
      </div>

      {canL && (
        <button
          onClick={() => scrollBy(-1)}
          className="absolute left-0 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/90 p-1.5 text-neutral-700 shadow-lg backdrop-blur transition hover:scale-110 dark:bg-neutral-900/90 dark:text-neutral-200"
          aria-label="Scroll left"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      {canR && (
        <button
          onClick={() => scrollBy(1)}
          className="absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/90 p-1.5 text-neutral-700 shadow-lg backdrop-blur transition hover:scale-110 dark:bg-neutral-900/90 dark:text-neutral-200"
          aria-label="Scroll right"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-start gap-3 animate-msg-in">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 via-fuchsia-500 to-emerald-500 text-white shadow-md animate-gradient">
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="rounded-2xl rounded-tl-md bg-white/80 px-4 py-3 shadow-sm ring-1 ring-black/[0.03] backdrop-blur-xl dark:bg-white/[0.04] dark:ring-white/5">
        <div className="flex items-center gap-1">
          <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400 [animation-delay:-0.3s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-fuchsia-400 [animation-delay:-0.15s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-emerald-400" />
        </div>
      </div>
    </div>
  );
}
