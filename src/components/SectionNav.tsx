"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "ratings", label: "Ratings" },
  { id: "results", label: "Results" },
  { id: "accuracy", label: "Accuracy" },
  { id: "openings", label: "Openings" },
  { id: "games", label: "Games" },
];

interface Props {
  username?: string;
}

export default function SectionNav({ username }: Props) {
  const [active, setActive] = useState("overview");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(entry.target.id);
          }
        }
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );

    for (const section of SECTIONS) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <nav className="sticky top-14 z-40 border-b border-[#3a3835] bg-[#262522]/90 backdrop-blur-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex gap-1 overflow-x-auto scrollbar-hide py-2 -mb-px">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => scrollTo(s.id)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-all ${
                active === s.id
                  ? "bg-[#81b64c]/15 text-[#81b64c]"
                  : "text-[#989795] hover:text-white hover:bg-[#3a3835]/60"
              }`}
            >
              {s.label}
            </button>
          ))}
          {username && (
            <Link
              href={`/player/${encodeURIComponent(username)}/puzzles`}
              className="px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-all text-[#989795] hover:text-white hover:bg-[#3a3835]/60"
            >
              Puzzles
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
