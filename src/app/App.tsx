import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { AuthProvider } from "../lib/auth/session";
import { DisplayPreferencesProvider } from "../lib/display";
import { LocaleFrame, LocaleProvider } from "../lib/i18n";
import { router } from "./router";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  return (
    <DisplayPreferencesProvider>
      <LocaleProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <LocaleFrame>
              <RouterProvider router={router} />
            </LocaleFrame>
          </AuthProvider>
        </QueryClientProvider>
      </LocaleProvider>
    </DisplayPreferencesProvider>
  );
}
