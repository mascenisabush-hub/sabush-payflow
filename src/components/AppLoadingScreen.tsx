import React from 'react';
import { ShoppingCart, Package, Receipt, BarChart3 } from 'lucide-react';

interface AppLoadingScreenProps {
  message?: string;
}

/**
 * Rich, branded loading screen used across App.tsx wherever the app is waiting
 * on auth/profile resolution or a lazy-loaded route chunk. Shares its visual
 * language with the boot splash (index.html) and WelcomeSplash: a rotating
 * solar "lamp" wash, sunburst rays, four module hex-badges (Vendas, Stock,
 * Faturas, Relatórios) physically orbiting a pulsing core, a comet of light
 * travelling the ring, and the full shining "SABUSH TECH" wordmark.
 *
 * Fully self-contained (inline <style>, no extra deps) so it's cheap to drop
 * into any Suspense fallback.
 */
export default function AppLoadingScreen({ message = 'A carregar o sistema...' }: AppLoadingScreenProps) {
  return (
    <div className="h-screen w-screen flex items-center justify-center overflow-hidden relative bg-[#050b17]">
      <style>{`
        .als-root-bg {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 14% 50%, rgba(214, 155, 37, 0.12), transparent 46%),
            radial-gradient(circle at 86% 50%, rgba(44, 99, 184, 0.14), transparent 46%);
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
            #2C63B8 0deg, #7CA3E0 55deg, #D69B25 130deg, #f5c877 165deg,
            #B8791A 200deg, #6b3fa0 260deg, #2C63B8 320deg, #2C63B8 360deg
          );
          filter: blur(90px) saturate(150%);
          opacity: 0.28;
          animation: als-lamp-spin 26s linear infinite;
          mix-blend-mode: screen;
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
          background: repeating-conic-gradient(from 0deg, rgba(245,200,119,0.14) 0deg 1.2deg, transparent 1.2deg 9deg);
          mask-image: radial-gradient(circle, transparent 30%, black 50%, transparent 72%);
          -webkit-mask-image: radial-gradient(circle, transparent 30%, black 50%, transparent 72%);
          animation: als-lamp-spin 40s linear infinite;
          mix-blend-mode: screen;
        }
        .als-grid {
          position: absolute;
          inset: -50%;
          background-image:
            linear-gradient(rgba(184, 121, 26, 0.07) 1px, transparent 1px),
            linear-gradient(90deg, rgba(184, 121, 26, 0.07) 1px, transparent 1px);
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
          background: radial-gradient(ellipse at 50% 45%, transparent 0%, transparent 34%, #050b17 82%);
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
          border: 1.5px solid rgba(184, 121, 26, 0.55);
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
          background: radial-gradient(circle, rgba(184, 121, 26, 0.4), transparent 70%);
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
          background: linear-gradient(100deg, #f5c877 0%, #B8791A 18%, #f5e9c8 32%, #7CA3E0 48%, #f5c877 64%, #60a5fa 80%, #f5c877 100%);
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
          background: linear-gradient(100deg, #7CA3E0 0%, #f5e9c8 35%, #f5c877 60%, #7CA3E0 100%);
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
          background: linear-gradient(90deg, transparent, #B8791A, #f5c877, #B8791A, transparent);
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
      <div className="als-vignette" />

      <div className="flex flex-col items-center gap-7 relative z-10">
        <div className="relative" style={{ width: 168, height: 168 }}>
          <svg className="als-ring-svg cw" viewBox="0 0 232 232" aria-hidden="true">
            <circle cx="116" cy="116" r="108" fill="none" stroke="rgba(214,155,37,0.2)" strokeWidth="1.2" strokeDasharray="2 9" />
            <circle cx="116" cy="116" r="108" fill="none" stroke="#f5c877" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="14 664" style={{ filter: 'drop-shadow(0 0 6px #f5c877)' }} />
          </svg>
          <svg className="als-ring-svg ccw" viewBox="0 0 232 232" aria-hidden="true">
            <circle cx="116" cy="116" r="94" fill="none" stroke="rgba(44,99,184,0.2)" strokeWidth="1" strokeDasharray="1 12" />
            <circle cx="116" cy="116" r="94" fill="none" stroke="#7CA3E0" strokeWidth="2" strokeLinecap="round" strokeDasharray="10 580" style={{ filter: 'drop-shadow(0 0 6px #7CA3E0)' }} />
          </svg>

          <div className="als-ping" />
          <div className="als-ping" style={{ animationDelay: '0.9s' }} />
          <div className="als-ping" style={{ animationDelay: '1.8s' }} />
          <div className="als-hub-glow" />

          {/* Orbiting module hex-badges: Vendas, Stock, Faturas, Relatórios */}
          <div className="als-orbit-node" style={{ ['--node-c' as any]: '#f5c877', ['--node-glow' as any]: 'rgba(214,155,37,0.6)', animationDelay: '0s' }}>
            <ShoppingCart size={15} />
          </div>
          <div className="als-orbit-node" style={{ ['--node-c' as any]: '#7CA3E0', ['--node-glow' as any]: 'rgba(44,99,184,0.6)', animationDelay: '-4s' }}>
            <Package size={15} />
          </div>
          <div className="als-orbit-node" style={{ ['--node-c' as any]: '#D69B25', ['--node-glow' as any]: 'rgba(214,155,37,0.6)', animationDelay: '-8s' }}>
            <Receipt size={15} />
          </div>
          <div className="als-orbit-node" style={{ ['--node-c' as any]: '#60a5fa', ['--node-glow' as any]: 'rgba(44,99,184,0.6)', animationDelay: '-12s' }}>
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
