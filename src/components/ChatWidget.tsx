import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import {
  MessageSquare,
  X,
  Send,
  Paperclip,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Bot,
} from "lucide-react";

const WEBHOOK_URL =
  "https://n8n-f2ty.srv1670697.hstgr.cloud/webhook-test/16276221-92eb-4379-9bd1-34d8eb162c96";

/* ---------------------------------- types --------------------------------- */

type Product = {
  id: string;
  title: string;
  price: string;
  image: string;
  stock?: number | null;
  url?: string | null;
};

type Message = {
  id: string;
  role: "user" | "bot";
  text: string;
  products?: Product[];
  error?: boolean;
};

type Phase = "idle" | "checking" | "streaming";

/* -------------------------------- utilities ------------------------------- */

const uid = () => Math.random().toString(36).slice(2, 10);

function getSessionId() {
  if (typeof window === "undefined") return "sess_ssr";
  let session = localStorage.getItem("chat_session_id");
  if (!session) {
    session = "sess_" + Math.random().toString(36).substring(2, 15);
    localStorage.setItem("chat_session_id", session);
  }
  return session;
}

function normalizePrice(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = String(value).trim();
  if (!raw) return "";
  return /^[\d.,]+$/.test(raw) ? `$${raw}` : raw;
}

/** Pull product objects out of arbitrary webhook JSON. */
function collectProducts(node: unknown, out: Product[] = [], depth = 0): Product[] {
  if (!node || depth > 6) return out;
  if (Array.isArray(node)) {
    node.forEach((item) => collectProducts(item, out, depth + 1));
    return out;
  }
  if (typeof node !== "object") return out;
  const obj = node as Record<string, unknown>;
  const image =
    obj.image ?? obj.imageUrl ?? obj.image_url ?? obj.thumbnail ?? obj.img ?? obj.picture;
  const title = obj.title ?? obj.name ?? obj.productTitle ?? obj.product_name;
  if (typeof image === "string" && image.startsWith("http") && title) {
    const stockRaw = obj.stock ?? obj.inventory ?? obj.available ?? obj.quantity;
    out.push({
      id: String(obj.id ?? uid()),
      title: String(title),
      price: normalizePrice(obj.price ?? obj.amount ?? obj.cost),
      image,
      stock:
        stockRaw === undefined || stockRaw === null || Number.isNaN(Number(stockRaw))
          ? null
          : Number(stockRaw),
      url:
        typeof (obj.url ?? obj.link ?? obj.productUrl) === "string"
          ? String(obj.url ?? obj.link ?? obj.productUrl)
          : null,
    });
    return out;
  }
  Object.values(obj).forEach((value) => collectProducts(value, out, depth + 1));
  return out;
}

type ImageHit = { start: number; end: number; url: string; alt: string };

const IMAGE_EXT = "(?:png|jpe?g|webp|gif|avif)";

/**
 * Find every image reference in the text, regardless of format:
 *  - ![alt](url)          markdown image
 *  - [alt](url.jpg)       link that points at an image
 *  - https://…/x.jpg      bare image url
 * Ordered by position so segment boundaries stay correct.
 */
function findImageHits(text: string): ImageHit[] {
  const hits: ImageHit[] = [];
  const seen = new Set<number>();
  const push = (start: number, end: number, url: string, alt: string) => {
    if (seen.has(start)) return;
    seen.add(start);
    hits.push({ start, end, url, alt });
  };

  const mdImage = /!\[([^\]]*)\]\(\s*(https?:\/\/[^\s)]+?)\s*\)/g;
  for (const m of text.matchAll(mdImage)) {
    push(m.index ?? 0, (m.index ?? 0) + m[0].length, m[2], m[1] ?? "");
  }

  const mdLinkImage = new RegExp(
    `\\[([^\\]]*)\\]\\(\\s*(https?:\\/\\/[^\\s)]+?\\.${IMAGE_EXT}(?:\\?[^\\s)]*)?)\\s*\\)`,
    "gi",
  );
  for (const m of text.matchAll(mdLinkImage)) {
    const idx = m.index ?? 0;
    if (text[idx - 1] === "!") continue;
    push(idx, idx + m[0].length, m[2], m[1] ?? "");
  }

  const bareImage = new RegExp(
    `https?:\\/\\/[^\\s)<>"']+\\.${IMAGE_EXT}(?:\\?[^\\s)<>"']*)?`,
    "gi",
  );
  for (const m of text.matchAll(bareImage)) {
    const idx = m.index ?? 0;
    const prev = text.slice(Math.max(0, idx - 2), idx);
    if (prev.endsWith("(")) continue; // already captured as markdown
    push(idx, idx + m[0].length, m[0], "");
  }

  return hits.sort((a, b) => a.start - b.start);
}

/** Pick the best title inside a product block. */
function pickTitle(block: string, alt: string): string {
  const candidates = [
    block.match(/^\s*(?:\d+[.)]\s*)?\*\*([^*\n]+)\*\*/m)?.[1],
    block.match(/\*\*([^*\n]+)\*\*/)?.[1],
    block.match(/^\s*#{1,6}\s*(.+)$/m)?.[1],
    block.match(/^\s*\d+[.)]\s*(.+)$/m)?.[1],
    alt,
  ];
  const found = candidates.find((value) => value && value.trim().length > 1);
  return (found ?? "Product").replace(/[*_`#]/g, "").trim();
}

/**
 * Extract product blocks from markdown. Blocks are segmented around every image
 * hit, and each block is extended BACKWARDS to the preceding blank line/list
 * marker so a title written *before* its image (the very first item, typically)
 * is still captured.
 */
function extractMarkdownProducts(text: string): { text: string; products: Product[] } {
  const hits = findImageHits(text);
  if (!hits.length) return { text, products: [] };

  const products: Product[] = [];
  const seenImages = new Set<string>();

  hits.forEach((hit, index) => {
    // Block spans from just after the previous image to just before the next one,
    // which naturally includes any leading title text for the first item.
    const blockStart = index === 0 ? 0 : hits[index - 1].end;
    const blockEnd = index + 1 < hits.length ? hits[index + 1].start : text.length;
    const block = text.slice(blockStart, blockEnd);

    if (seenImages.has(hit.url)) return;
    seenImages.add(hit.url);

    const price = block.match(/(?:\$|₹|€|£|USD\s?|INR\s?)\s?[\d][\d.,]*/i)?.[0]?.trim() ?? "";
    const stock = block.match(/(\d+)\s*(?:available|in stock|left|units?)/i)?.[1];
    const link =
      [...block.matchAll(/\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g)]
        .map((m) => m[1])
        .find((url) => url !== hit.url && !new RegExp(`\\.${IMAGE_EXT}`, "i").test(url)) ?? null;

    products.push({
      id: uid(),
      title: pickTitle(block, hit.alt),
      price,
      image: hit.url,
      stock: stock ? Number(stock) : null,
      url: link,
    });
  });

  // Only strip the image tokens themselves — keep the readable text list intact.
  let cleaned = "";
  let cursor = 0;
  hits.forEach((hit) => {
    cleaned += text.slice(cursor, hit.start);
    cursor = hit.end;
  });
  cleaned += text.slice(cursor);
  cleaned = cleaned
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { text: cleaned, products };
}

function parseWebhookPayload(raw: string): { text: string; products: Product[] } {
  let text = raw;
  let products: Product[] = [];
  try {
    const json = JSON.parse(raw);
    products = collectProducts(json);
    const pick = (node: unknown): string => {
      if (typeof node === "string") return node;
      if (Array.isArray(node)) return node.map(pick).filter(Boolean).join("\n\n");
      if (node && typeof node === "object") {
        const obj = node as Record<string, unknown>;
        for (const key of ["output", "text", "message", "reply", "answer", "response"]) {
          if (typeof obj[key] === "string") return obj[key] as string;
        }
      }
      return "";
    };
    text = pick(json) || (products.length ? "" : raw);
  } catch {
    /* plain text response */
  }

  // Always parse the markdown too, then merge — the text list can contain items
  // that the structured payload missed (and vice versa).
  const parsed = extractMarkdownProducts(text);
  text = parsed.text;
  const byImage = new Map<string, Product>();
  [...products, ...parsed.products].forEach((product) => {
    const existing = byImage.get(product.image);
    if (!existing) {
      byImage.set(product.image, product);
      return;
    }
    byImage.set(product.image, {
      ...existing,
      title: existing.title && existing.title !== "Product" ? existing.title : product.title,
      price: existing.price || product.price,
      stock: existing.stock ?? product.stock,
      url: existing.url ?? product.url,
    });
  });
  products = [...byImage.values()];

  return { text: text.trim(), products };
}


/* ------------------------------ product carousel -------------------------- */

function ProductCarousel({ products }: { products: Product[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const sync = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 8);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    sync();
  }, [sync, products.length]);

  const scrollBy = (dir: -1 | 1) =>
    scroller.current?.scrollBy({ left: dir * 206, behavior: "smooth" });

  return (
    <div className="relative mt-2 -mr-1">
      {canLeft && (
        <button
          type="button"
          aria-label="Scroll left"
          onClick={() => scrollBy(-1)}
          className="absolute left-0 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white p-1.5 text-gray-700 shadow-md border border-gray-100 transition-opacity hover:bg-gray-50"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      {canRight && (
        <button
          type="button"
          aria-label="Scroll right"
          onClick={() => scrollBy(1)}
          className="absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white p-1.5 text-gray-700 shadow-md border border-gray-100 transition-opacity hover:bg-gray-50"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}

      <div
        ref={scroller}
        onScroll={sync}
        className="no-scrollbar flex overflow-x-auto gap-4 py-2 scroll-smooth snap-x snap-mandatory"
      >
        {products.map((product, index) => (
          <div
            key={product.id}
            style={{ animationDelay: `${index * 70}ms` }}
            className="animate-card-slide-in flex w-[190px] flex-shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all duration-300 hover:shadow-md"
          >
            <img
              src={product.image}
              alt={product.title}
              loading="lazy"
              decoding="async"
              className="h-32 w-full rounded-t-2xl object-cover"
            />
            <h4 className="mt-2 line-clamp-2 px-2.5 text-xs font-bold text-gray-900">
              {product.title}
            </h4>
            {product.price && (
              <p className="mt-0.5 px-2.5 text-sm font-semibold text-emerald-600">
                {product.price}
              </p>
            )}
            {product.stock !== null && product.stock !== undefined && (
              <p className="mt-1 flex items-center gap-1.5 px-2.5 text-[11px] text-gray-500">
                <span className="h-1.5 w-1.5 flex-shrink-0 animate-bounce rounded-full bg-green-500" />
                In Stock: {product.stock} available
              </p>
            )}
            <a
              href={product.url ?? "#"}
              target={product.url ? "_blank" : undefined}
              rel="noreferrer"
              className="mx-2.5 mt-auto mb-2.5 w-[calc(100%-20px)] rounded-xl border border-gray-100 bg-gray-50 py-1.5 text-center text-xs font-medium text-gray-700 transition-colors duration-200 hover:bg-gray-100 hover:text-black"
            >
              Add to Cart
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------- primitives ------------------------------ */

function BotAvatar({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <div
      className={`flex flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white ring-1 ring-indigo-500/20 ${
        size === "sm" ? "h-6 w-6" : "h-8 w-8"
      }`}
    >
      <Bot className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
    </div>
  );
}

function Dots() {
  return (
    <span className="flex items-center gap-1">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          style={{ animationDelay: `${delay}ms` }}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400"
        />
      ))}
    </span>
  );
}

const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="whitespace-pre-wrap leading-relaxed">{children}</p>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="mt-2 inline-flex items-center rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white no-underline transition-colors hover:bg-indigo-700"
    >
      {children}
    </a>
  ),
  img: ({ src, alt }: { src?: string; alt?: string }) => (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className="mt-2 max-h-48 w-full rounded-xl object-cover shadow-sm"
    />
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="my-1 list-disc space-y-0.5 pl-4">{children}</ul>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-slate-900">{children}</strong>
  ),
};

/* --------------------------------- widget --------------------------------- */

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [streamText, setStreamText] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "bot",
      text: "Hi! I'm Aria. How can I help you find products today?",
    },
  ]);

  const scrollArea = useRef<HTMLDivElement>(null);
  const streamTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const el = scrollArea.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, phase, streamText, open]);

  useEffect(
    () => () => {
      if (streamTimer.current) clearInterval(streamTimer.current);
    },
    [],
  );

  const streamIn = useCallback((text: string, products: Product[]) => {
    const words = text.length ? text.split(/(\s+)/) : [];
    if (!words.length) {
      setPhase("idle");
      setMessages((prev) => [...prev, { id: uid(), role: "bot", text, products }]);
      return;
    }
    setPhase("streaming");
    setStreamText("");
    let index = 0;
    streamTimer.current = setInterval(() => {
      index += 1;
      setStreamText(words.slice(0, index).join(""));
      if (index >= words.length) {
        if (streamTimer.current) clearInterval(streamTimer.current);
        setStreamText("");
        setPhase("idle");
        setMessages((prev) => [...prev, { id: uid(), role: "bot", text, products }]);
      }
    }, 28);
  }, []);

  const send = async () => {
    const value = input.trim();
    if (!value || phase !== "idle") return;
    setInput("");
    setMessages((prev) => [...prev, { id: uid(), role: "user", text: value }]);
    setPhase("checking");

    try {
      const response = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatInput: value, sessionId: getSessionId() }),
      });
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      const raw = await response.text();
      const { text, products } = parseWebhookPayload(raw);
      streamIn(text || (products.length ? "Here's what I found:" : "…"), products);
    } catch (error) {
      setPhase("idle");
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "bot",
          error: true,
          text:
            error instanceof Error
              ? `Connection issue: ${error.message}. Please try again.`
              : "Something went wrong. Please try again.",
        },
      ]);
    }
  };

  const statusLabel = useMemo(
    () => (phase === "checking" ? "Checking..." : "Aria is typing..."),
    [phase],
  );

  return (
    <>
      {/* Chat window */}
      <div
        className={`fixed bottom-24 right-5 z-50 flex w-[440px] max-w-[calc(100vw-2.5rem)] h-[650px] max-h-[calc(100vh-8rem)] origin-bottom-right flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all duration-300 ease-out ${
          open
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "pointer-events-none translate-y-4 scale-95 opacity-0"
        }`}
        role="dialog"
        aria-label="Chat with Aria"
      >
        {/* Header */}
        <header className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="relative">
            <BotAvatar />
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-slate-50 bg-green-500" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">Aria — Shop Assistant</p>
            <p className="text-xs text-slate-500">Online now</p>
          </div>
          <button
            type="button"
            aria-label="Close chat"
            onClick={() => setOpen(false)}
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Thread */}
        <div ref={scrollArea} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {messages.map((message) =>
            message.role === "user" ? (
              <div key={message.id} className="animate-msg-in flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-br-md bg-indigo-600 px-3.5 py-2 text-sm text-white shadow-sm">
                  <p className="whitespace-pre-wrap">{message.text}</p>
                </div>
              </div>
            ) : (
              <div key={message.id} className="animate-msg-in flex items-start gap-2">
                <BotAvatar size="sm" />
                <div className="min-w-0 flex-1">
                  <div
                    className={`inline-block max-w-full rounded-2xl rounded-tl-md px-3.5 py-2 text-sm shadow-sm ${
                      message.error
                        ? "border border-red-200 bg-red-50 text-red-700"
                        : "bg-slate-100 text-slate-800"
                    }`}
                  >
                    {message.error && (
                      <AlertTriangle className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" />
                    )}
                    <div className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkBreaks]}
                        components={markdownComponents}
                      >
                        {message.text}
                      </ReactMarkdown>
                    </div>
                  </div>
                  {message.products && message.products.length > 0 && (
                    <ProductCarousel products={message.products} />
                  )}
                </div>
              </div>
            ),
          )}

          {phase !== "idle" && (
            <div className="animate-msg-in flex items-start gap-2">
              <BotAvatar size="sm" />
              <div className="min-w-0 flex-1">
                <div className="inline-flex max-w-full items-center gap-2 rounded-2xl rounded-tl-md bg-slate-100 px-3.5 py-2 text-sm text-slate-700 shadow-sm">
                  <span className="animate-in text-xs font-medium text-slate-500">
                    {statusLabel}
                  </span>
                  {phase === "streaming" && <Dots />}
                </div>
                {phase === "streaming" && streamText && (
                  <div className="mt-2 inline-block max-w-full rounded-2xl rounded-tl-md bg-slate-100 px-3.5 py-2 text-sm text-slate-800 shadow-sm">
                    <p className="whitespace-pre-wrap leading-relaxed">
                      {streamText}
                      <span className="animate-caret ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 bg-slate-500" />
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Composer */}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
          className="border-t border-slate-200 bg-white px-3 py-3"
        >
          <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 transition-colors focus-within:border-indigo-500 focus-within:bg-white">
            <button
              type="button"
              aria-label="Attach a file"
              className="mb-1 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <textarea
              value={input}
              rows={1}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              placeholder="Ask about a product..."
              className="max-h-24 flex-1 resize-none bg-transparent py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
            />
            <button
              type="submit"
              aria-label="Send message"
              disabled={!input.trim() || phase !== "idle"}
              className="mb-0.5 rounded-xl bg-indigo-600 p-2 text-white transition-all duration-200 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1.5 text-center text-[11px] text-slate-400">
            Powered by Aria AI · Enter to send
          </p>
        </form>
      </div>

      {/* FAB */}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Close chat" : "Open chat"}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-xl transition-all duration-300 hover:scale-105 hover:bg-indigo-700 active:scale-95"
      >
        <span className="relative block h-6 w-6">
          <MessageSquare
            className={`absolute inset-0 h-6 w-6 transition-all duration-300 ${
              open ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"
            }`}
          />
          <X
            className={`absolute inset-0 h-6 w-6 transition-all duration-300 ${
              open ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"
            }`}
          />
        </span>
      </button>
    </>
  );
}

export default ChatWidget;
