// src/components/orders/orders.ui.tsx
import type React from "react";

export function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "white",
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        padding: 14,
      }}
    >
      {children}
    </div>
  );
}

export function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>{children}</div>;
}

export function Field(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        padding: 10,
        borderRadius: 10,
        border: "1px solid #d6dbe6",
        ...(props.style || {}),
      }}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      style={{
        padding: 10,
        borderRadius: 10,
        border: "1px solid #d6dbe6",
        background: "white",
        ...(props.style || {}),
      }}
    />
  );
}

export function ButtonPrimary(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      style={{
        padding: "10px 12px",
        borderRadius: 12,
        border: "1px solid #0B7285",
        background: "#0B7285",
        color: "white",
        cursor: "pointer",
        fontWeight: 800,
        width: "fit-content",
        opacity: props.disabled ? 0.6 : 1,
        ...(props.style || {}),
      }}
    />
  );
}

export function ButtonGhost(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      style={{
        padding: "10px 12px",
        borderRadius: 12,
        border: "1px solid #d6dbe6",
        background: "white",
        cursor: "pointer",
        fontWeight: 800,
        width: "fit-content",
        opacity: props.disabled ? 0.6 : 1,
        ...(props.style || {}),
      }}
    />
  );
}

export function Chip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 10px",
        borderRadius: 999,
        border: "1px solid #d6dbe6",
        background: active ? "#0B7285" : "white",
        color: active ? "white" : "#243B53",
        cursor: "pointer",
        fontWeight: 800,
        fontSize: 12,
      }}
    >
      {children}
    </button>
  );
}

export function StatusBadge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "ok" | "warn" | "info" | "muted";
}) {
  const styles =
    tone === "ok"
      ? { background: "#ECFDF5", border: "1px solid #BBF7D0", color: "#065F46" }
      : tone === "warn"
      ? { background: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E" }
      : tone === "info"
      ? { background: "#EFF6FF", border: "1px solid #BFDBFE", color: "#1E40AF" }
      : { background: "#F3F4F6", border: "1px solid #E5E7EB", color: "#334155" };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        ...styles,
      }}
    >
      {children}
    </span>
  );
}

export function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        padding: 12,
        background: "white",
        minWidth: 180,
      }}
    >
      <div style={{ fontSize: 11, color: "#667", fontWeight: 800, letterSpacing: 0.3 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 900, marginTop: 6 }}>{value}</div>
      {hint && <div style={{ fontSize: 12, color: "#667", marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

export function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, overflow: "hidden", background: "white" }}>
      {children}
    </div>
  );
}

export function Th({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <th
      style={{
        padding: "12px 12px",
        textAlign: "left",
        fontSize: 12,
        color: "#667",
        background: "#f9fafb",
        ...style,
      }}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  style,
  colSpan,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      style={{
        padding: "12px 12px",
        fontSize: 14,
        borderTop: "1px solid #eef2f7",
        ...style,
      }}
    >
      {children}
    </td>
  );
}
