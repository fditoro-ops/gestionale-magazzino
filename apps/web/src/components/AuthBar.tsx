import { useAuth } from "../auth/authStore";

export default function AuthBar() {
  const { user, logout } = useAuth();

  if (!user) return null;

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        padding: 12,
        borderBottom: "1px solid #e5e7eb",
        background: "#fff",
      }}
    >
      <div>
        <div style={{ fontWeight: 700 }}>
          {fullName || user.email}
        </div>
        <div style={{ fontSize: 13, opacity: 0.7 }}>
          {user.role}
        </div>
      </div>

      <button
        onClick={logout}
        style={{
          border: 0,
          borderRadius: 10,
          padding: "10px 14px",
          cursor: "pointer",
        }}
      >
        Logout
      </button>
    </div>
  );
}