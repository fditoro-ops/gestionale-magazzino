type Props = {
  size?: number;
} & JSX.IntrinsicElements["svg"];

export default function MartiniLogo({
  size = 112,
  ...rest
}: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Martini logo"
      {...rest}
    >
      <path
        d="M18 26H110L64 70L18 26Z"
        stroke="rgba(255,255,255,0.92)"
        strokeWidth="4"
        strokeLinejoin="round"
      />

      <path
        d="M28 28H100L64 64L28 28Z"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      <path
        d="M26 31H102L64 67L26 31Z"
        fill="rgba(220,38,38,0.88)"
      />

      <path
        d="M35 34H53L64 46L46 64L35 34Z"
        fill="rgba(255,255,255,0.12)"
      />

      <path
        d="M64 70V104"
        stroke="rgba(255,255,255,0.92)"
        strokeWidth="4"
        strokeLinecap="round"
      />

      <path
        d="M60 74V102"
        stroke="rgba(255,255,255,0.30)"
        strokeWidth="2"
        strokeLinecap="round"
      />

      <path
        d="M44 108H84"
        stroke="rgba(255,255,255,0.92)"
        strokeWidth="4"
        strokeLinecap="round"
      />

      <circle cx="38" cy="20" r="7" fill="rgba(34,197,94,0.95)" />
      <circle cx="35.5" cy="17.5" r="2.2" fill="rgba(255,255,255,0.22)" />

      <path
        d="M44 19C48 12 57 10 61 16C55 18 51 22 44 19Z"
        fill="rgba(34,197,94,0.92)"
      />

      <path
        d="M48 17C52 14 56 14 59 16"
        stroke="rgba(255,255,255,0.28)"
        strokeWidth="2"
        strokeLinecap="round"
      />

      <path
        d="M18 28C22 18 32 13 42 15"
        stroke="rgba(251,191,36,0.95)"
        strokeWidth="5"
        strokeLinecap="round"
      />

      <path
        d="M22 28C25 22 31 19 38 20"
        stroke="rgba(255,255,255,0.25)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}