export default function LogoCore({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Coppa */}
      <path
        d="M8 14 L56 14 L32 36 Z"
        fill="#0B7285"
        opacity="0.9"
      />

      {/* Gambo */}
      <rect x="30" y="36" width="4" height="14" fill="#0B7285" />

      {/* Base */}
      <rect x="22" y="50" width="20" height="4" rx="2" fill="#0B7285" />

      {/* Oliva */}
      <circle cx="40" cy="20" r="4" fill="#FBBF24" />
    </svg>
  );
}