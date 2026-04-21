"use client";

import type { ReactNode } from "react";
import { Provider as UrqlProvider } from "urql";
import { client } from "@/lib/urql-client";

export function Providers({ children }: { children: ReactNode }) {
  return <UrqlProvider value={client}>{children}</UrqlProvider>;
}
