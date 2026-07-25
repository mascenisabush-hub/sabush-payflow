import React, { useEffect, useState } from 'react';

interface AppLoadingScreenProps {
  message?: string;
}

/**
 * Rich, branded loading screen used across App.tsx wherever the app is waiting
 * on auth/profile resolution or a lazy-loaded route chunk. The concept-art
 * backdrop is the star here — it's shown at full clarity with nothing
 * overlaid on top of it. A single glowing blue light pulses at the center,
 * and the SABUSH TECH wordmark reveals itself letter by letter on mount.
 *
 * Fully self-contained (inline <style>, no extra deps) so it's cheap to drop
 * into any Suspense fallback.
 */
export default function AppLoadingScreen({ message = 'A carregar o sistema...' }: AppLoadingScreenProps) {
  const mainWord = 'SABUSH';
  const subWord = 'TECH';
  const letterDelay = 0.07;
  const mainDone = mainWord.length * letterDelay;

  return (
    <div className="h-screen w-screen flex items-center justify-center overflow-hidden relative bg-[#0B1F4D]">
      <span className="sr-only" role="status" aria-live="polite">{message}</span>
      <style>{`
        .als-bg-image {
          position: absolute;
          inset: -3%;
          background-image: url('/loading/sabush-tech-concept.webp');
          background-size: cover;
          background-position: center 38%;
          opacity: 1;
          filter: saturate(1.08);
          animation: als-bg-drift 24s ease-in-out infinite alternate;
        }
        @keyframes als-bg-drift {
          0% { transform: scale(1.02) translate(0, 0); }
          100% { transform: scale(1.08) translate(-0.6%, -0.4%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .als-bg-image { animation: none; }
        }

        /* Strong pulsing blue light — replaces the old static logo */
        .als-blue-light {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 260px;
          height: 260px;
          transform: translate(-50%, -50%);
          border-radius: 50%;
          background: radial-gradient(circle, rgba(147, 197, 253, 0.95) 0%, rgba(59, 130, 246, 0.65) 32%, rgba(37, 99, 235, 0.25) 58%, transparent 75%);
          filter: blur(6px);
          mix-blend-mode: screen;
          animation: als-blue-pulse 2.4s ease-in-out infinite;
          z-index: 6;
          pointer-events: none;
        }
        .als-blue-light::after {
          content: "";
          position: absolute;
          inset: 30%;
          border-radius: 50%;
          background: radial-gradient(circle, #FFFFFF 0%, #BFDBFE 45%, transparent 75%);
          filter: blur(2px);
          animation: als-blue-core-pulse 2.4s ease-in-out infinite;
        }
        @keyframes als-blue-pulse {
          0%, 100% { opacity: 0.7; transform: translate(-50%, -50%) scale(0.9); }
          50% { opacity: 1; transform: translate(-50%, -50%) scale(1.15); }
        }
        @keyframes als-blue-core-pulse {
          0%, 100% { opacity: 0.75; transform: scale(0.92); }
          50% { opacity: 1; transform: scale(1.08); }
        }
        @media (prefers-reduced-motion: reduce) {
          .als-blue-light, .als-blue-light::after { animation: none; }
        }

        .als-word-main {
          font-size: clamp(22px, 5vmin, 28px);
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #FFFFFF;
          text-shadow: 0 0 18px rgba(147, 197, 253, 0.9), 0 0 36px rgba(59, 130, 246, 0.6);
        }
        .als-word-tech {
          margin-top: 2px;
          font-size: clamp(10px, 2vmin, 12px);
          font-weight: 800;
          letter-spacing: 0.5em;
          text-indent: 0.5em;
          text-transform: uppercase;
          color: #BFDBFE;
          text-shadow: 0 0 14px rgba(147, 197, 253, 0.8);
        }
        .als-letter {
          display: inline-block;
          opacity: 0;
          transform: translateY(10px);
          animation: als-letter-in 0.5s ease-out forwards;
        }
        @keyframes als-letter-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .als-letter { animation: none; opacity: 1; transform: none; }
        }

        .als-bar-fill {
          position: absolute;
          top: 0; bottom: 0;
          width: 40%;
          border-radius: 999px;
          background: linear-gradient(90deg, transparent, #93C5FD, #FFFFFF, #93C5FD, transparent);
          animation: als-sweep 1.4s ease-in-out infinite;
        }
        @keyframes als-sweep {
          0% { left: -45%; }
          100% { left: 105%; }
        }
        @media (prefers-reduced-motion: reduce) {
          .als-bar-fill { animation: none; }
        }
      `}</style>

      <div className="als-bg-image" />
      <div className="als-blue-light" />

      <div className="flex flex-col items-center gap-7 relative z-10 mt-[26vh]">
        <div className="text-center">
          <div className="als-word-main">
            {mainWord.split('').map((letter, i) => (
              <span key={i} className="als-letter" style={{ animationDelay: `${i * letterDelay}s` }}>
                {letter}
              </span>
            ))}
          </div>
          <div className="als-word-tech">
            {subWord.split('').map((letter, i) => (
              <span key={i} className="als-letter" style={{ animationDelay: `${mainDone + i * letterDelay}s` }}>
                {letter}
              </span>
            ))}
          </div>
        </div>

        <div className="relative w-[160px] h-[3px] rounded-full bg-white/10 overflow-hidden">
          <div className="als-bar-fill" />
        </div>
      </div>
    </div>
  );
}
