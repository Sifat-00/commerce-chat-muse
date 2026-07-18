import { createFileRoute } from "@tanstack/react-router";
import { ChatWidget } from "@/components/ChatWidget";
import { ShoppingBag, Sparkles, Zap } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Shopify AI Assistant — Smart Shopping Chatbot" },
      {
        name: "description",
        content:
          "A premium AI-powered shopping assistant that helps customers discover products instantly.",
      },
      { property: "og:title", content: "Shopify AI Assistant" },
      {
        property: "og:description",
        content: "Premium AI shopping chatbot for modern storefronts.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-neutral-950 text-neutral-50">
      {/* Background gradient */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-violet-600/20 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-emerald-600/20 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      <main className="relative mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 py-20 text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-neutral-300 backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          AI Assistant is live
        </div>
        <h1 className="bg-gradient-to-b from-white to-neutral-400 bg-clip-text text-5xl font-bold tracking-tight text-transparent sm:text-7xl">
          Shop smarter with AI
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-neutral-400">
          A premium conversational commerce experience. Ask, discover, and buy —
          all inside one beautifully designed chat.
        </p>

        <div className="mt-12 grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { icon: Sparkles, title: "Smart search", desc: "Natural language product discovery" },
            { icon: ShoppingBag, title: "Rich cards", desc: "Beautiful product previews inline" },
            { icon: Zap, title: "Instant replies", desc: "Streaming responses in real-time" },
          ].map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="rounded-2xl border border-white/10 bg-white/5 p-5 text-left backdrop-blur transition-colors hover:bg-white/[0.07]"
            >
              <Icon className="h-5 w-5 text-violet-400" />
              <h3 className="mt-3 text-sm font-semibold">{title}</h3>
              <p className="mt-1 text-xs text-neutral-400">{desc}</p>
            </div>
          ))}
        </div>

        <p className="mt-16 text-sm text-neutral-500">
          👉 Tap the chat bubble in the bottom-right to try it
        </p>
      </main>

      <ChatWidget />
    </div>
  );
}
