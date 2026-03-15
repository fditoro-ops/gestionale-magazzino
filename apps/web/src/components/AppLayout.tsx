import type React from "react";
import MartiniLogo from "./MartiniLogo";

export type TabKey =
  | "dashboard"
  | "movements"
  | "warehouse"
  | "items"
  | "orders"
  | "suppliers"
  | "users";

export default function AppLayout({
  tab,
  onTabChange,
  children,
  onReload,
  mode,
  onModeChange,
}: {
  tab: TabKey;
  onTabChange: (t: TabKey) => void;
  children: React.ReactNode;
  onReload: () => void;
  mode: "live" | "historical";
  onModeChange: (m: "live" | "historical") => void;
}) {
  return (
    <div style={styles.shell}>
      <aside style={styles.sidebar}>
        <div style={styles.brand}>
          <MartiniLogo size={120} />
          <div style={styles.brandText}>Core</div>
        </div>

        <nav style={styles.nav}>
          <SideItem
            active={tab === "dashboard"}
            onClick={() => onTabChange("dashboard")}
          >
            Dashboard
          </SideItem>

          <SideItem
            active={tab === "movements"}
            onClick={() => onTabChange("movements")}
          >
            Movimentazioni
          </SideItem>

          <SideItem
            active={tab === "warehouse"}
            onClick={() => onTabChange("warehouse")}
          >
            Magazzino
          </SideItem>

          <SideItem
            active={tab === "items"}
            onClick={() => onTabChange("items")}
          >
            Articoli
          </SideItem>

          <SideItem
            active={tab === "orders"}
            onClick={() => onTabChange("orders")}
          >
            Ordini
          </SideItem>

          <SideItem
            active={tab === "suppliers"}
            onClick={() => onTabChange("suppliers")}
          >
            Fornitori
          </SideItem>

          <SideItem
            active={tab === "users"}
            onClick={() => onTabChange("users")}
          >
            Utenti
          </SideItem>

          <div style={styles.navSpacer} />

          <SideItem
            active={false}
            onClick={() => alert("Step dopo: Impostazioni")}
          >
            Impostazioni
          </SideItem>
        </nav>
      </aside>

      <main style={styles.main}>
        <header style={styles.topbar}>
          <div style={styles.searchWrap}>
            <span style={styles.searchIcon}>⌕</span>
            <input style={styles.search} placeholder="Cerca..." />
          </div>

          <div style={styles.topbarRight}>
            <div style={styles.modeWrap}>
              <button
                style={{
                  ...styles.modeBtn,
                  ...(mode === "live" ? styles.modeBtnActive : null),
                }}
                onClick={() => onModeChange("live")}
              >
                Live
              </button>

              <button
                style={{
                  ...styles.modeBtn,
                  ...(mode === "historical" ? styles.modeBtnActive : null),
                }}
                onClick={() => onModeChange("historical")}
              >
                Storico
              </button>
            </div>

            <button style={styles.reloadBtn} onClick={onReload}>
              Reload
            </button>

            <div style={styles.user}>
              <div style={styles.avatar} />
              <div>
                <div style={styles.userName}>Mario Rossi</div>
                <div style={styles.userSub}>Admin</div>
              </div>
            </div>
          </div>
        </header>

        <div style={styles.content}>{children}</div>

        <footer style={styles.footer}>
          <span>🟢 API /health ok</span>
          <span style={styles.dot}>•</span>
          <span>Sync Magazzino: 12:00</span>
          <span style={styles.dot}>•</span>
          <span>Versione 1.0.0</span>
        </footer>
      </main>
    </div>
  );
}

function SideItem({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        ...styles.sideItem,
        ...(active ? styles.sideItemActive : null),
      }}
    >
      {children}
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    display: "grid",
    gridTemplateColumns: "260px 1fr",
    minHeight: "100vh",
    background: "transparent",
  },

  sidebar: {
    background: "linear-gradient(180deg, #1F6B76 0%, #114E59 100%)",
    color: "white",
    padding: 18,
    boxShadow: "2px 0 18px rgba(0,0,0,0.12)",
  },

  brand: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: "18px 0 22px 0",
    borderBottom: "1px solid rgba(255,255,255,0.14)",
    marginBottom: 18,
  },

  brandText: {
    fontSize: 24,
    fontWeight: 800,
    letterSpacing: 0.5,
  },

  nav: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },

  sideItem: {
    textAlign: "left",
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    cursor: "pointer",
    fontWeight: 700,
  },

  sideItemActive: {
    background: "rgba(255,255,255,0.18)",
    border: "1px solid rgba(255,255,255,0.22)",
  },

  navSpacer: { flex: 1 },

  main: {
    display: "flex",
    flexDirection: "column",
    background: "transparent",
  },

  topbar: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "14px 18px",
    background: "rgba(255,255,255,0.70)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    borderBottom: "1px solid rgba(217,226,236,0.8)",
  },

  searchWrap: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "white",
    border: "1px solid #D9E2EC",
    borderRadius: 12,
    padding: "10px 12px",
    flex: 1,
    maxWidth: 520,
  },

  searchIcon: { opacity: 0.55 },

  search: {
    border: "none",
    outline: "none",
    width: "100%",
    fontSize: 14,
  },

  topbarRight: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 12,
  },

  modeWrap: {
    display: "flex",
    border: "1px solid #D9E2EC",
    borderRadius: 12,
    overflow: "hidden",
    background: "white",
  },

  modeBtn: {
    padding: "10px 12px",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontWeight: 700,
    color: "#334E68",
  },

  modeBtnActive: {
    background: "#0B7285",
    color: "white",
  },

  reloadBtn: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #D9E2EC",
    background: "white",
    cursor: "pointer",
    fontWeight: 700,
  },

  user: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    paddingLeft: 6,
  },

  avatar: {
    width: 34,
    height: 34,
    borderRadius: 999,
    background: "#CBD5E1",
  },

  userName: {
    fontWeight: 800,
    fontSize: 13,
    color: "#243B53",
  },

  userSub: {
    fontSize: 11,
    color: "#627D98",
  },

  content: {
    padding: 18,
  },

  footer: {
    marginTop: "auto",
    padding: "10px 18px",
    fontSize: 12,
    color: "#52606D",
    borderTop: "1px solid rgba(217,226,236,0.8)",
    background: "rgba(255,255,255,0.70)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    display: "flex",
    alignItems: "center",
    gap: 10,
  },

  dot: { opacity: 0.5 },
};
