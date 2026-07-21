import React from 'react';
import { ShoppingCart, Package, Receipt, BarChart3, Leaf } from 'lucide-react';

interface AppLoadingScreenProps {
  message?: string;
}

/**
 * Rich, branded loading screen used across App.tsx wherever the app is waiting
 * on auth/profile resolution or a lazy-loaded route chunk. Shares its visual
 * language with the boot splash (index.html) and WelcomeSplash: a bright
 * "sunrise through the canopy" backdrop, sunburst rays, five module hex-badges
 * (Vendas, Stock, Faturas, Relatórios, Automação) physically orbiting a
 * pulsing core, comets of light travelling the rings, and the full shining
 * "SABUSH TECH" wordmark rendered in dark brand-ink for legibility.
 *
 * Fully self-contained (inline <style>, no extra deps) so it's cheap to drop
 * into any Suspense fallback.
 */
export default function AppLoadingScreen({ message = 'A carregar o sistema...' }: AppLoadingScreenProps) {
  return (
    <div className="h-screen w-screen flex items-center justify-center overflow-hidden relative" style={{
      background: 'linear-gradient(180deg, #FFFBEF 0%, #FDF3CE 20%, #F3EBC2 40%, #E9F1D4 68%, #DCEBC8 100%)'
    }}>
      <style>{`
        .als-root-bg {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse at 50% 8%, rgba(255, 241, 204, 0.9), transparent 52%),
            radial-gradient(circle at 10% 88%, rgba(111, 191, 91, 0.22), transparent 56%),
            radial-gradient(circle at 92% 82%, rgba(63, 145, 66, 0.16), transparent 58%);
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
            #F6D375 0deg, #FFF3D0 40deg, #8FCB6E 100deg, #4E9A4E 150deg,
            #2C63B8 210deg, #7CA3E0 260deg, #F6D375 320deg, #F6D375 360deg
          );
          filter: blur(100px) saturate(150%);
          opacity: 0.3;
          animation: als-lamp-spin 26s linear infinite;
          mix-blend-mode: multiply;
        }
        @keyframes als-lamp-spin {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }
        .als-rays {
          position: absolute;
          width: 520px;
          height: 520px;
          border-radius: 50%;
          background: repeating-conic-gradient(from 0deg, rgba(255,236,168,0.58) 0deg 1.4deg, transparent 1.4deg 8deg);
          mask-image: radial-gradient(circle, transparent 28%, black 48%, transparent 74%);
          -webkit-mask-image: radial-gradient(circle, transparent 28%, black 48%, transparent 74%);
          animation: als-lamp-spin 40s linear infinite;
          mix-blend-mode: soft-light;
        }
        .als-shine {
          position: absolute;
          width: 320px;
          height: 320px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255, 250, 220, 0.95), transparent 70%);
          filter: blur(4px);
          animation: als-shine-breathe 3.2s ease-in-out infinite;
          mix-blend-mode: soft-light;
        }
        @keyframes als-shine-breathe {
          0%, 100% { opacity: 0.5; transform: scale(0.9); }
          50% { opacity: 1; transform: scale(1.1); }
        }
        .als-grid {
          position: absolute;
          inset: -50%;
          background-image:
            linear-gradient(rgba(184, 121, 26, 0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(184, 121, 26, 0.05) 1px, transparent 1px);
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
          background: radial-gradient(ellipse at 50% 45%, transparent 0%, transparent 42%, rgba(196, 222, 166, 0.5) 100%);
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
          border: 1.5px solid rgba(184, 121, 26, 0.5);
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
          filter: drop-shadow(0 0 8px var(--node-glow, rgba(184,121,26,0.6))) drop-shadow(0 6px 10px rgba(11,27,51,0.25));
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
          position: relative;
          font-size: clamp(22px, 5vmin, 28px);
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #0B1B33;
        }
        .als-word-main::after {
          content: attr(data-text);
          position: absolute;
          inset: 0;
          background: linear-gradient(100deg, transparent 20%, rgba(255,255,255,0.9) 40%, #f5c877 48%, rgba(255,255,255,0.9) 56%, transparent 76%);
          background-size: 260% auto;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: als-shine 3.2s linear infinite;
          mix-blend-mode: overlay;
        }
        .als-word-tech {
          position: relative;
          margin-top: 2px;
          font-size: clamp(10px, 2vmin, 12px);
          font-weight: 800;
          letter-spacing: 0.5em;
          text-indent: 0.5em;
          text-transform: uppercase;
          color: #4E9A4E;
        }
        .als-word-tech::after {
          content: attr(data-text);
          position: absolute;
          inset: 0;
          text-indent: 0.5em;
          background: linear-gradient(100deg, transparent 20%, rgba(255,255,255,0.9) 45%, #8FCB6E 52%, rgba(255,255,255,0.9) 59%, transparent 78%);
          background-size: 260% auto;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: als-shine 3.6s linear infinite reverse;
          mix-blend-mode: overlay;
        }
        @keyframes als-shine { from { background-position: 260% center; } to { background-position: -260% center; } }

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
          .als-grid, .als-lamp, .als-rays, .als-shine, .als-ring-svg, .als-ping, .als-hub-glow,
          .als-orbit-node, .als-word-main::after, .als-word-tech::after, .als-bar-fill {
            animation: none;
          }
        }
      `}</style>

      <div className="als-root-bg" />
      <div className="als-lamp" />
      <div className="als-rays" />
      <div className="als-shine" />
      <div className="als-grid" />
      <div className="als-vignette" />

      <div className="flex flex-col items-center gap-7 relative z-10">
        <div className="relative" style={{ width: 168, height: 168 }}>
          <svg className="als-ring-svg cw" viewBox="0 0 232 232" aria-hidden="true">
            <circle cx="116" cy="116" r="108" fill="none" stroke="rgba(184,121,26,0.3)" strokeWidth="1.2" strokeDasharray="2 9" />
            <circle cx="116" cy="116" r="108" fill="none" stroke="#B8791A" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="14 664" style={{ filter: 'drop-shadow(0 0 6px #f5c877)' }} />
            <circle cx="116" cy="116" r="82" fill="none" stroke="rgba(63,145,66,0.28)" strokeWidth="1" strokeDasharray="1 10" />
            <circle cx="116" cy="116" r="82" fill="none" stroke="#3F9142" strokeWidth="2" strokeLinecap="round" strokeDasharray="9 506" style={{ filter: 'drop-shadow(0 0 6px #8FCB6E)' }} />
          </svg>
          <svg className="als-ring-svg ccw" viewBox="0 0 232 232" aria-hidden="true">
            <circle cx="116" cy="116" r="94" fill="none" stroke="rgba(44,99,184,0.26)" strokeWidth="1" strokeDasharray="1 12" />
            <circle cx="116" cy="116" r="94" fill="none" stroke="#2C63B8" strokeWidth="2" strokeLinecap="round" strokeDasharray="10 580" style={{ filter: 'drop-shadow(0 0 6px #7CA3E0)' }} />
          </svg>

          <div className="als-ping" />
          <div className="als-ping" style={{ animationDelay: '0.9s' }} />
          <div className="als-ping" style={{ animationDelay: '1.8s' }} />
          <div className="als-hub-glow" />

          {/* Orbiting module hex-badges: Vendas, Stock, Faturas, Relatórios, Automação */}
          <div className="als-orbit-node" style={{ ['--node-c' as any]: '#f5c877', ['--node-glow' as any]: 'rgba(214,155,37,0.6)', animationDelay: '0s' }}>
            <ShoppingCart size={15} />
          </div>
          <div className="als-orbit-node" style={{ ['--node-c' as any]: '#7CA3E0', ['--node-glow' as any]: 'rgba(44,99,184,0.6)', animationDelay: '-3.2s' }}>
            <Package size={15} />
          </div>
          <div className="als-orbit-node" style={{ ['--node-c' as any]: '#D69B25', ['--node-glow' as any]: 'rgba(214,155,37,0.6)', animationDelay: '-6.4s' }}>
            <Receipt size={15} />
          </div>
          <div className="als-orbit-node" style={{ ['--node-c' as any]: '#60a5fa', ['--node-glow' as any]: 'rgba(44,99,184,0.6)', animationDelay: '-9.6s' }}>
            <BarChart3 size={15} />
          </div>
          <div className="als-orbit-node" style={{ ['--node-c' as any]: '#6FBF5B', ['--node-glow' as any]: 'rgba(63,145,66,0.6)', animationDelay: '-12.8s' }}>
            <Leaf size={15} />
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
          <div className="als-word-main" data-text="SABUSH">SABUSH</div>
          <div className="als-word-tech" data-text="TECH">TECH</div>
          <p className="mt-3 text-xs font-semibold text-[#5C6B4A] animate-pulse">{message}</p>
        </div>

        <div className="relative w-[160px] h-[3px] rounded-full bg-[#0B1B33]/10 overflow-hidden">
          <div className="als-bar-fill" />
        </div>
      </div>
    </div>
  );
}
