import React, { useEffect, useState } from 'react';
import { ShoppingCart, Package, Receipt, BarChart3 } from 'lucide-react';

interface AppLoadingScreenProps {
  message?: string;
}

/**
 * Rich, branded loading screen used across App.tsx wherever the app is waiting
 * on auth/profile resolution or a lazy-loaded route chunk. Shares its visual
 * language with the boot splash (index.html) and WelcomeSplash, but reads as a
 * distinct, later moment: where the boot splash is a cool blue/white "powering
 * on", this screen is warm gold/light — like arriving somewhere. A one-time
 * "arrival" light wash plays on mount (starting blue-tinted, warming to gold)
 * so the hand-off from the boot splash feels like the light itself warming up
 * rather than a hard cut.
 *
 * Fully self-contained (inline <style>, no extra deps) so it's cheap to drop
 * into any Suspense fallback.
 */
export default function AppLoadingScreen({ message = 'A carregar o sistema...' }: AppLoadingScreenProps) {
  const [arrived, setArrived] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setArrived(true), 20);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="h-screen w-screen flex items-center justify-center overflow-hidden relative bg-[#0d0806]">
      <style>{`
        .als-bg-image {
          position: absolute;
          inset: -3%;
          background-image: url('/loading/sabush-tech-concept.webp');
          background-size: cover;
          background-position: center 38%;
          opacity: 0.62;
          filter: saturate(1.15) brightness(0.95);
          animation: als-bg-drift 24s ease-in-out infinite alternate;
        }
        @keyframes als-bg-drift {
          0% { transform: scale(1.04) translate(0, 0); }
          100% { transform: scale(1.14) translate(-1.2%, -0.8%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .als-bg-image { animation: none; }
        }

        .als-root-bg {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 14% 50%, rgba(214, 155, 37, 0.20), transparent 46%),
            radial-gradient(circle at 86% 50%, rgba(245, 200, 119, 0.14), transparent 46%);
        }
        .als-lamp {
          position: absolute;
          width: 140vmax;
          height: 140vmax;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: conic-gradient(
            from 0deg,
            #D69B25 0deg, #f5e9c8 55deg, #f5c877 130deg, #eaf2ff 165deg,
            #D69B25 200deg, #B8791A 260deg, #D69B25 320deg, #D69B25 360deg
          );
          filter: blur(90px) saturate(150%);
          opacity: 0.32;
          animation: als-lamp-spin 26s linear infinite;
          mix-blend-mode: screen;
        }

        /* One-shot "arrival" wash: a warm light sweeps in over a cool blue base,
           playing once as the screen mounts, then fading out of the way. */
        .als-arrival {
          position: absolute;
          inset: 0;
          z-index: 5;
          pointer-events: none;
          background: radial-gradient(ellipse at 50% 45%, rgba(124, 163, 224, 0.55) 0%, rgba(44, 99, 184, 0.35) 38%, transparent 72%);
          opacity: 1;
          transition: background 1.1s ease, opacity 1.3s ease 0.15s;
        }
        .als-arrival.als-arrival-in {
          background: radial-gradient(ellipse at 50% 45%, rgba(245, 200, 119, 0.0) 0%, rgba(214, 155, 37, 0.0) 38%, transparent 72%);
          opacity: 0;
        }
        .als-arrival-flash {
          position: absolute;
          inset: 0;
          z-index: 4;
          pointer-events: none;
          background: radial-gradient(circle at 50% 48%, rgba(255, 244, 214, 0.9), rgba(245, 200, 119, 0.25) 32%, transparent 62%);
          opacity: 0;
          animation: als-flash 1.3s ease-out 0.05s both;
        }
        @keyframes als-flash {
          0% { opacity: 0; transform: scale(0.6); }
          22% { opacity: 0.85; transform: scale(1.05); }
          100% { opacity: 0; transform: scale(1.7); }
        }
        @media (prefers-reduced-motion: reduce) {
          .als-arrival-flash { animation: none; opacity: 0; }
        }
        @keyframes als-lamp-spin {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }
        .als-rays {
          position: absolute;
          width: 480px;
          height: 480px;
          border-radius: 50%;
          background: repeating-conic-gradient(from 0deg, rgba(255, 235, 190, 0.20) 0deg 1.2deg, transparent 1.2deg 9deg);
          mask-image: radial-gradient(circle, transparent 30%, black 50%, transparent 72%);
          -webkit-mask-image: radial-gradient(circle, transparent 30%, black 50%, transparent 72%);
          animation: als-lamp-spin 40s linear infinite;
          mix-blend-mode: screen;
        }
        .als-grid {
          position: absolute;
          inset: -50%;
          background-image:
            linear-gradient(rgba(214, 155, 37, 0.09) 1px, transparent 1px),
            linear-gradient(90deg, rgba(214, 155, 37, 0.09) 1px, transparent 1px);
          background-size: 42px 42px;
          animation: als-grid-drift 16s linear infinite;
          mask-image: radial-gradient(circle at 50% 45%, black 0%, transparent 70%);
        }
        @keyframes als-grid-drift {
          from { transform: translate(0, 0); }
          to { transform: translate(42px, 42px); }
        }
        .als-vignette {
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse at 50% 45%, transparent 0%, transparent 34%, #0d0806 82%);
        }

        /* Comet rings behind the hub: a short bright arc riding a rotating ring
           reads as a travelling point of light rather than a static spin. */
        .als-ring-svg { position: absolute; inset: -32px; overflow: visible; }
        .als-ring-svg.cw { animation: als-spin 22s linear infinite; }
        .als-ring-svg.ccw { animation: als-spin-rev 28s linear infinite; }
        @keyframes als-spin { to { transform: rotate(360deg); } }
        @keyframes als-spin-rev { to { transform: rotate(-360deg); } }

        .als-ping {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 1.5px solid rgba(214, 155, 37, 0.6);
          animation: als-ping-anim 2.8s cubic-bezier(0.2, 0.6, 0.4, 1) infinite;
        }
        @keyframes als-ping-anim {
          0% { transform: scale(0.55); opacity: 0.9; }
          100% { transform: scale(1.9); opacity: 0; }
        }
        .als-hub-glow {
          position: absolute;
          inset: 14px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(214, 155, 37, 0.45), transparent 70%);
          animation: als-pulse 2.2s ease-in-out infinite;
        }
        @keyframes als-pulse {
          0%, 100% { opacity: 0.55; transform: scale(0.94); }
          50% { opacity: 1; transform: scale(1.06); }
        }

        /* Hex module badges physically orbit the hub (true circular motion via
           rotate → translate → counter-rotate), each glowing gold or blue. */
        .als-orbit-node {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 38px;
          height: 38px;
          margin: -19px;
          clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(160deg, #0d1e3a, #071224);
          color: var(--node-c, #f5c877);
          filter: drop-shadow(0 0 8px var(--node-glow, rgba(184,121,26,0.6)));
          animation: als-orbit 16s linear infinite;
        }
        .als-orbit-node::before {
          content: "";
          position: absolute;
          inset: 0;
          clip-path: inherit;
          padding: 1.4px;
          background: linear-gradient(160deg, var(--node-c, #f5c877), transparent 55%, var(--node-c, #f5c877));
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
        }
        @keyframes als-orbit {
          from { transform: rotate(0deg) translateX(78px) rotate(0deg); }
          to   { transform: rotate(360deg) translateX(78px) rotate(-360deg); }
        }

        .als-word-main {
          font-size: clamp(22px, 5vmin, 28px);
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          background: linear-gradient(100deg, #f5c877 0%, #D69B25 18%, #fff6e2 32%, #f5e9c8 48%, #f5c877 64%, #7CA3E0 80%, #f5c877 100%);
          background-size: 300% auto;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: als-shine 4.5s linear infinite;
        }
        .als-word-tech {
          margin-top: 2px;
          font-size: clamp(10px, 2vmin, 12px);
          font-weight: 800;
          letter-spacing: 0.5em;
          text-indent: 0.5em;
          text-transform: uppercase;
          background: linear-gradient(100deg, #f5c877 0%, #fff6e2 35%, #D69B25 60%, #f5c877 100%);
          background-size: 260% auto;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: als-shine 3.6s linear infinite reverse;
        }
        @keyframes als-shine { to { background-position: -300% center; } }

        .als-bar-fill {
          position: absolute;
          top: 0; bottom: 0;
          width: 40%;
          border-radius: 999px;
          background: linear-gradient(90deg, transparent, #D69B25, #fff6e2, #D69B25, transparent);
          animation: als-sweep 1.4s ease-in-out infinite;
        }
        @keyframes als-sweep {
          0% { left: -45%; }
          100% { left: 105%; }
        }
        @media (prefers-reduced-motion: reduce) {
          .als-grid, .als-lamp, .als-rays, .als-ring-svg, .als-ping, .als-hub-glow,
          .als-orbit-node, .als-word-main, .als-word-tech, .als-bar-fill {
            animation: none;
          }
        }
      `}</style>

      <div className="als-root-bg" />
      <div className="als-lamp" />
      <div className="als-rays" />
      <div className="als-grid" />
      <div className="als-bg-image" />
      <div className="als-vignette" />
      <div className={`als-arrival ${arrived ? 'als-arrival-in' : ''}`} />
      <div className="als-arrival-flash" />

      <div className="flex flex-col items-center gap-7 relative z-10">
        <div className="relative" style={{ width: 168, height: 168 }}>
          <svg className="als-ring-svg cw" viewBox="0 0 232 232" aria-hidden="true">
            <circle cx="116" cy="116" r="108" fill="none" stroke="rgba(214,155,37,0.28)" strokeWidth="1.2" strokeDasharray="2 9" />
            <circle cx="116" cy="116" r="108" fill="none" stroke="#f5e9c8" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="14 664" style={{ filter: 'drop-shadow(0 0 6px #f5c877)' }} />
          </svg>
          <svg className="als-ring-svg ccw" viewBox="0 0 232 232" aria-hidden="true">
            <circle cx="116" cy="116" r="94" fill="none" stroke="rgba(214,155,37,0.18)" strokeWidth="1" strokeDasharray="1 12" />
            <circle cx="116" cy="116" r="94" fill="none" stroke="#D69B25" strokeWidth="2" strokeLinecap="round" strokeDasharray="10 580" style={{ filter: 'drop-shadow(0 0 6px #D69B25)' }} />
          </svg>

          <div className="als-ping" />
          <div className="als-ping" style={{ animationDelay: '0.9s' }} />
          <div className="als-ping" style={{ animationDelay: '1.8s' }} />
          <div className="als-hub-glow" />

          {/* Orbiting module hex-badges: Vendas, Stock, Faturas, Relatórios */}
          <div className="als-orbit-node" style={{ ['--node-c' as any]: '#f5c877', ['--node-glow' as any]: 'rgba(214,155,37,0.6)', animationDelay: '0s' }}>
            <ShoppingCart size={15} />
          </div>
          <div className="als-orbit-node" style={{ ['--node-c' as any]: '#eaf2ff', ['--node-glow' as any]: 'rgba(214,155,37,0.5)', animationDelay: '-4s' }}>
            <Package size={15} />
          </div>
          <div className="als-orbit-node" style={{ ['--node-c' as any]: '#D69B25', ['--node-glow' as any]: 'rgba(214,155,37,0.6)', animationDelay: '-8s' }}>
            <Receipt size={15} />
          </div>
          <div className="als-orbit-node" style={{ ['--node-c' as any]: '#7CA3E0', ['--node-glow' as any]: 'rgba(44,99,184,0.6)', animationDelay: '-12s' }}>
            <BarChart3 size={15} />
          </div>

          <img
            src="/icon-192.png"
            alt="Sabush"
            className="absolute rounded-2xl"
            style={{
              width: 56, height: 56,
              top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
            }}
          />
        </div>

        <div className="text-center">
          <div className="als-word-main">SABUSH</div>
          <div className="als-word-tech">TECH</div>
          <p className="mt-3 text-xs font-semibold text-slate-400 animate-pulse">{message}</p>
        </div>

        <div className="relative w-[160px] h-[3px] rounded-full bg-white/10 overflow-hidden">
          <div className="als-bar-fill" />
        </div>
      </div>
    </div>
  );
}
