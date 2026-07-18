import { createFileRoute } from "@tanstack/react-router";
import { ChatApp } from "@/components/ChatApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Shopify AI Assistant" },
      {
        name: "description",
        content:
          "Chat with your Shopify AI Assistant to discover products, get recommendations, and shop faster.",
      },
      { property: "og:title", content: "Shopify AI Assistant" },
      {
        property: "og:description",
        content: "Chat with your Shopify AI Assistant to discover products, get recommendations, and shop faster.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return <ChatApp />;
}
