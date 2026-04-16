"use client";

import { useState, useCallback, createContext, useContext, useRef } from "react";

export type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const toast = useCallback((message: string, type: ToastType = "success") => {
    const id = `t-${++counter.current}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);

  const borderColor = (type: ToastType) =>
    type === "error" ? "var(--loss)" : type === "success" ? "var(--win)" : "var(--blue)";

  const iconFor = (type: ToastType) =>
    type === "error" ? "✕" : type === "success" ? "✓" : "ℹ";

  const ariaRole = (type: ToastType) => (type === "error" ? "alert" : "status");

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          aria-atomic="true"
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            zIndex: 9999,
            pointerEvents: "none",
          }}
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              role={ariaRole(t.type)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px 16px",
                borderRadius: "8px",
                background: "var(--bg-card)",
                border: `1px solid ${borderColor(t.type)}`,
                color: "var(--text-1)",
                fontSize: "13px",
                fontWeight: 500,
                boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
                animation: "fadeIn 0.2s ease both",
                maxWidth: "320px",
              }}
            >
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: borderColor(t.type),
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: 800,
                  color: "#fff",
                  flexShrink: 0,
                }}
              >
                {iconFor(t.type)}
              </span>
              {t.message}
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
