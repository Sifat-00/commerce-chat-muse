import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";

import { ChatWidget } from "@/components/ChatWidget";
import styles from "./embed.css?inline";

const TAG_NAME = "aria-chat-widget";

/**
 * Custom element that renders the floating chat bubble + chat window inside a
 * shadow root, so host-page CSS can never affect (or be affected by) the widget.
 */
class AriaChatWidgetElement extends HTMLElement {
  private root: Root | null = null;

  connectedCallback() {
    if (this.root) return;

    const shadow = this.shadowRoot ?? this.attachShadow({ mode: "open" });

    // Prefer adoptedStyleSheets (single shared sheet), fall back to <style>.
    if ("adoptedStyleSheets" in Document.prototype && typeof CSSStyleSheet !== "undefined") {
      try {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(styles);
        shadow.adoptedStyleSheets = [sheet];
      } catch {
        const style = document.createElement("style");
        style.textContent = styles;
        shadow.appendChild(style);
      }
    } else {
      const style = document.createElement("style");
      style.textContent = styles;
      shadow.appendChild(style);
    }

    const mount = document.createElement("div");
    shadow.appendChild(mount);

    this.root = createRoot(mount);
    this.root.render(
      <StrictMode>
        <ChatWidget />
      </StrictMode>,
    );
  }

  disconnectedCallback() {
    const root = this.root;
    this.root = null;
    // Unmount out of the current commit cycle to avoid React warnings.
    if (root) setTimeout(() => root.unmount(), 0);
  }
}

function define() {
  if (typeof window === "undefined") return;
  if (!window.customElements.get(TAG_NAME)) {
    window.customElements.define(TAG_NAME, AriaChatWidgetElement);
  }
}

/** Mounts the widget into `target` (defaults to <body>) and returns the element. */
function mount(target: Element | string = document.body) {
  define();
  const host = typeof target === "string" ? document.querySelector(target) : target;
  if (!host) throw new Error(`[aria-chat] mount target not found: ${String(target)}`);
  const existing = host.querySelector(TAG_NAME);
  if (existing) return existing as HTMLElement;
  const element = document.createElement(TAG_NAME);
  host.appendChild(element);
  return element;
}

/** Removes every widget instance from the page. */
function unmount() {
  document.querySelectorAll(TAG_NAME).forEach((node) => node.remove());
}

define();

// Auto-mount unless the loading <script> opts out with data-auto="false".
if (typeof document !== "undefined") {
  const script = document.currentScript as HTMLScriptElement | null;
  const auto = script?.dataset["auto"] !== "false";
  if (auto) {
    const start = () => {
      if (!document.querySelector(TAG_NAME)) mount(document.body);
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }
  }
}

const AriaChat = { mount, unmount, define, tagName: TAG_NAME };

declare global {
  interface Window {
    AriaChat?: typeof AriaChat;
  }
}

if (typeof window !== "undefined") window.AriaChat = AriaChat;

export { mount, unmount, define, TAG_NAME };
export default AriaChat;
