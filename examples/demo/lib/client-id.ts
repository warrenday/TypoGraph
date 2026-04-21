"use client";

import { useRef } from "react";

const randomId = () =>
  "c_" +
  (typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2));

export const useClientId = (): string => {
  const ref = useRef<string>(null);
  if (ref.current === null) {
    ref.current = randomId();
  }
  return ref.current;
};
