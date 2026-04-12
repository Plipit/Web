/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";

export const LogoMark = ({ className = "w-8 h-8" }: { className?: string }) => {
  return (
    <svg 
      viewBox="0 0 100 100" 
      className={className}
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="50%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#EC4899" />
        </linearGradient>
      </defs>
      {/* Top-Left Segment (Blue to Purple) - The Stem and Top Bar */}
      <path 
        d="M30 85 V32 C30 22 40 22 50 22 H70" 
        stroke="url(#logo-gradient)" 
        strokeWidth="11" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      />
      {/* Bottom-Right Segment (Purple to Pink) - The Right Bar and Middle Bar */}
      <path 
        d="M80 32 V62 C80 72 70 72 60 72 H35" 
        stroke="url(#logo-gradient)" 
        strokeWidth="11" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      />
      {/* Diamond Dot - Perfectly Aligned Accent */}
      <rect 
        x="78" y="10" width="16" height="16" rx="4" 
        fill="#8B5CF6" 
        transform="rotate(45 86 18)"
      />
    </svg>
  );
};

export const Logo = ({ className = "" }: { className?: string }) => {
  return (
    <div className={`flex items-center gap-3 group cursor-pointer ${className}`}>
      <LogoMark className="w-10 h-10 transition-transform duration-500 group-hover:scale-110" />
      <span className="text-3xl font-bold tracking-tight font-display text-white">plipit</span>
    </div>
  );
};
