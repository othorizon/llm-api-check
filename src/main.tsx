import React from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import "./styles.css";

const container = document.getElementById("root")!;
const app = (
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
// Prerendered pages (see scripts/prerender.mjs) carry the app markup and are hydrated; in dev Vite
// serves index.html as is, where the root only holds the <!--app-html--> placeholder comment, so
// hydrating there would only produce a mismatch and a second render.
if (container.firstElementChild) hydrateRoot(container, app);
else createRoot(container).render(app);
