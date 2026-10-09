"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/pwa";

/** Mounted once in the root layout. */
export function PwaRegister() {
  useEffect(() => {
    void registerServiceWorker();
  }, []);
  return null;
}
