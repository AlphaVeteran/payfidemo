export default function PayFiLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`payfi-logo-ring shrink-0 ${className}`} aria-hidden>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="text-white"
      >
        <path
          d="M13 2L4 14h6l-1 8 10-12h-6l0-8z"
          fill="currentColor"
          className="drop-shadow-sm"
        />
      </svg>
    </div>
  );
}
