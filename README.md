# Shopify AI Chat

Create a premium, production-ready, modern E-commerce Chatbot Interface with a sleek dark/light theme (similar to ChatGPT or Vercel's design style) using Tailwind CSS. 

The chatbot must include the following advanced, real-world functionalities:

1. CHAT WINDOW & VISUAL ANCHORS:

- A beautifully floating chat widget icon at the bottom right of the screen.

- When clicked, it opens a smooth animation chat container containing a crisp header ("Shopify AI Assistant", green active online dot).

- Welcome message initialized automatically: "Hi! How can I help you find products today?"

2. REAL BOT TYPING EFFECT (STREAMING ANIMATION):

- When a user sends a message, show a typing indicator animation (three bouncing dots) for the bot.

- When the bot receives the response text, it must display the text word-by-word with a smooth "typing stream" animation effect to feel realistic.

3. RICH MARKDOWN & PROPS SUPPORT (IMAGES & LINKS):

- The chat window must fully render Markdown.

- If the bot response contains a Markdown image url formatted as `![Product Image](url)`, render it as a beautifully styled product card photo with rounded corners and a shadow constraint. Do not just print raw text.

- If the bot response contains a Markdown link formatted as `[Buy Now](url)`, convert it into a highly clickable, prominent modern button styled with a smooth accent color (e.g., violet or emerald) that opens the Shopify product page in a new browser tab (`target="_blank"`).

4. BACKEND HTTPS WEBHOOK CONNECTION LINK:

- Create a configuration function or a clean state variable in the code where the message payload is sent.

- When the user types a message and clicks 'Send' (or presses Enter), it must perform a standard async HTTPS POST request to my n8n Webhook URL.

- The payload sent to n8n must be structured in the JSON request body exactly as: `{"chatInput": "USER_MESSAGE_HERE"}`.

- It must await the response from the webhook and feed that clean text response back into the bot's dynamic typing message feed.

Ensure the entire application is fully responsive, clean, and interactive, utilizing beautiful icons (Lucide Icons) for the send arrow, attachment clip, and user profile avatars.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://commerce-chat-muse.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/fe86e5aa-1c71-48c7-9af6-e448545ffd70).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
