import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const atlasDocument: Plugin = {
  name: "politik-atlas-document",
  configureServer(server) {
    server.middlewares.use((request, _response, next) => {
      if (/^\/peta(?:\/embed)?\/?(?:\?|$)/.test(request.url ?? "")) request.url = "/atlas.html";
      next();
    });
  },
  configurePreviewServer(server) {
    server.middlewares.use((request, _response, next) => {
      if (/^\/peta(?:\/embed)?\/?(?:\?|$)/.test(request.url ?? "")) request.url = "/atlas.html";
      next();
    });
  },
  transformIndexHtml: {
    order: "post",
    handler(html, context) {
      if (!context.filename.endsWith("atlas.html")) return html;
      return html.replace(
        /<link rel="stylesheet" crossorigin href="([^"]+)">/g,
        '<link rel="preload" href="$1" as="style"><link data-atlas-style rel="stylesheet" crossorigin href="$1" media="print">',
      );
    },
  },
};

export default defineConfig({
  plugins: [atlasDocument, react()],
  build: {
    rolldownOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        atlas: resolve(__dirname, "atlas.html"),
      },
    },
  },
});
