import { createFileRoute } from "@tanstack/react-router";
import { ChatWidget } from "@/components/ChatWidget";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Aria — AI Shopping Assistant Widget" },
      {
        name: "description",
        content:
          "Aria is a premium AI shopping assistant widget that answers product questions and surfaces live product recommendations.",
      },
      { property: "og:title", content: "Aria — AI Shopping Assistant Widget" },
      {
        property: "og:description",
        content:
          "Aria is a premium AI shopping assistant widget that answers product questions and surfaces live product recommendations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 text-center">
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500">
          Live demo
        </span>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          Aria — AI Shopping Assistant
        </h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-500">
          Tap the chat button in the bottom-right corner to ask about products, availability and
          pricing.
        </p>
      </div>
      <ChatWidget />
    </main>
  );
}
