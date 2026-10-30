import { act } from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";

/**
 * Lets React Query's deferred notifications commit inside act, so axe and other
 * async work do not trip React's unwrapped-update warning.
 */
export async function settleQueries(client: QueryClient) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    if (client.isFetching() === 0) return;
  }
}
