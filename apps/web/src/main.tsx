import { ApiProvider } from "@crm/api-client/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./styles/tokens.css";

const container = document.getElementById("root");
if (container === null) {
  throw new Error("#root not found");
}

// B-03: the shared tRPC/React Query client (packages/api-client), so Map.tsx and later screens
// call search.properties/search.permits/property.get through the one client every app imports —
// never a page-local fetch or a second client (plan.md "Shared Client Package").
createRoot(container).render(
  <StrictMode>
    <ApiProvider>
      <App />
    </ApiProvider>
  </StrictMode>,
);
