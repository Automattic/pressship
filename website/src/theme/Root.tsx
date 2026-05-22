import React, { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export type InstallMethod = "npx" | "npm" | "wp-cli";

export interface InstallMethodContextType {
  method: InstallMethod;
  setMethod: (method: InstallMethod) => void;
  prefix: string;
}

export const InstallMethodContext = createContext<InstallMethodContextType>({
  method: "npx",
  setMethod: () => {},
  prefix: "npx pressship"
});

export const useInstallMethod = () => useContext(InstallMethodContext);

export function getCommandPrefix(methodLabel: string) {
  if (methodLabel === "npm") return "pressship";
  if (methodLabel === "wp-cli") return "wp ship";
  return "npx pressship";
}

export default function Root({ children }: { children: ReactNode }) {
  const [method, setMethodState] = useState<InstallMethod>("npx");

  useEffect(() => {
    const saved = localStorage.getItem("pressship-install-method");
    if (saved === "npx" || saved === "npm" || saved === "wp-cli") {
      setMethodState(saved);
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key === "pressship-install-method" && (e.newValue === "npx" || e.newValue === "npm" || e.newValue === "wp-cli")) {
        setMethodState(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setMethod = (newMethod: InstallMethod) => {
    setMethodState(newMethod);
    localStorage.setItem("pressship-install-method", newMethod);
    // Dispatch a custom event so other components in the same tab can update without waiting
    window.dispatchEvent(new Event("pressship-method-changed"));
  };

  useEffect(() => {
    const onCustomEvent = () => {
      const saved = localStorage.getItem("pressship-install-method");
      if (saved === "npx" || saved === "npm" || saved === "wp-cli") {
        setMethodState(saved);
      }
    };
    window.addEventListener("pressship-method-changed", onCustomEvent);
    return () => window.removeEventListener("pressship-method-changed", onCustomEvent);
  }, []);

  return (
    <InstallMethodContext.Provider value={{ method, setMethod, prefix: getCommandPrefix(method) }}>
      {children}
    </InstallMethodContext.Provider>
  );
}
