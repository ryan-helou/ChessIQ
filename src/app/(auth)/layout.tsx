export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "var(--bg)" }}
    >
      {/* Subtle grid background */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle, var(--border) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          opacity: 0.4,
        }}
      />
      <div className="relative z-10 w-full max-w-[400px]">
        {/* Logo */}
        <a href="/" className="flex items-center justify-center gap-2.5 mb-8">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="6" fill="var(--green)" opacity="0.9"/>
            <path d="M11 25V23.5C11 23.5 9 22 9 19C9 16 11 14 11 14L10 12H12L13 10H15L15.5 11.5C17 11 18 11 19 12C20 13 20 14 20 14L18 15L19 17C19 17 20 19 19 21C18 23 17 23.5 17 23.5V25H11Z" fill="white" opacity="0.95"/>
            <rect x="10" y="26" width="12" height="2" rx="1" fill="white" opacity="0.7"/>
          </svg>
          <span style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-1)" }}>
            Chess<span style={{ color: "var(--green)" }}>IQ</span>
          </span>
        </a>
        {children}
      </div>
    </div>
  );
}
