"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  username?: string;
}

export default function Header({ username }: Props) {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      router.push(`/player/${searchInput.trim()}`);
    }
  };

  return (
    <header className="sticky top-0 z-50 border-b border-[#3a3835] bg-[#262522]/95 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <a
            href="/"
            className="flex items-center gap-2.5 text-white font-bold text-lg hover:opacity-80 transition-opacity shrink-0"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-[#81b64c]">
              <path d="M12 2L9 5H6v3L2 12l4 4v3h3l3 3 3-3h3v-3l4-4-4-4V5h-3L12 2z" fill="currentColor" opacity="0.2"/>
              <path d="M12 2L9 5H6v3L2 12l4 4v3h3l3 3 3-3h3v-3l4-4-4-4V5h-3L12 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
              <circle cx="12" cy="12" r="3" fill="currentColor"/>
            </svg>
            Chess IQ
          </a>

          {/* Search */}
          <form onSubmit={handleSearch} className="flex-1 max-w-sm ml-6">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#706e6b]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search player..."
                className="w-full pl-9 pr-4 py-2 bg-[#1a1916] border border-[#3a3835] rounded-lg text-sm text-white placeholder-[#706e6b] focus:outline-none focus:ring-2 focus:ring-[#81b64c]/40 focus:border-transparent transition-all"
              />
            </div>
          </form>

          {/* Current player indicator */}
          {username && (
            <div className="hidden sm:flex items-center gap-2 ml-4 text-sm text-[#989795]">
              <div className="w-2 h-2 rounded-full bg-[#81b64c]" />
              {username}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
