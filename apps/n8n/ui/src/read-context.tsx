import { createContext, useContext } from "react";
import type { N8nReads } from "./n8n-reads";

export const N8nReadContext = createContext<N8nReads | null>(null);
export function useN8nReads() {
  const reads = useContext(N8nReadContext);
  if (!reads) throw new Error("n8n reads require an application session.");
  return reads;
}
