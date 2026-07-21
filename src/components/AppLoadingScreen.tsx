import React from 'react';
import { ShoppingCart, Package, Receipt, BarChart3 } from 'lucide-react';

interface AppLoadingScreenProps {
  message?: string;
}

/**
 * Rich, branded loading screen used across App.tsx wherever the app is waiting
 * on auth/profile resolution or a lazy-loaded route chunk. Replaces the old
 * plain spinner with an animated "hub" motif: four module icons (Vendas,
 * Stock, Faturas, Relatórios) orbiting a pulsing core, signaling that this is
 * one powerful, unified system rather than a generic loading indicator.
 *
 * Fully self-contained (inline <style>, no extra deps) so it's cheap to drop
 * into any Suspense fallback.
 */
export default function AppLoadingScreen({ message = 'A carregar o sistema...' }: AppLoadingScreenProps) {
  return (
    <div className="h-screen w-screen flex items-center justify-center overflow-hidden relative bg-[#060d1c]">
      <style>{`
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
        .als-orbit-node {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 34px;
          height: 34px;
          margin: -17px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(15, 23, 42, 0.9);
          border: 1px solid rgba(184, 121, 26, 0.4);
          color: #f5c877;
          box-shadow: 0 4px 14px rgba(0,0,0,0.35);
          animation: als-orbit 15s linear infinite;
        }
        @keyframes als-orbit {
          from { transform: rotate(0deg) translateX(74px) rotate(0deg); }
          to   { transform: rotate(360deg) translateX(74px) rotate(-360deg); }
        }
        .als-wordmark span {
          color: #B8791A;
        }
        .als-bar-fill {
          position: absolute;
          top: 0; bottom: 0;
          width: 40%;
          border-radius: 999px;
          background: #B8791A;
          animation: als-sweep 1.4s ease-in-out infinite;
        }
        @keyframes als-sweep {
          0% { left: -45%; }
          100% { left: 105%; }
        }
        @media (prefers-reduced-motion: reduce) {
          .als-grid, .als-ping, .als-hub-glow, .als-orbit-node, .als-wordmark span, .als-bar-fill {
            animation: none;
          }
        }
      `}</style>

      <div className="als-grid" />

      <div className="flex flex-col items-center gap-7 relative z-10">
        <div className="relative" style={{ width: 168, height: 168 }}>
          <div className="als-ping" />
          <div className="als-ping" style={{ animationDelay: '0.9s' }} />
          <div className="als-ping" style={{ animationDelay: '1.8s' }} />
          <div className="als-hub-glow" />

          {/* Orbiting module icons: Vendas, Stock, Faturas, Relatórios */}
          <div className="als-orbit-node" style={{ animationDelay: '0s' }}>
            <ShoppingCart size={15} />
          </div>
          <div className="als-orbit-node" style={{ animationDelay: '-3.75s' }}>
            <Package size={15} />
          </div>
          <div className="als-orbit-node" style={{ animationDelay: '-7.5s' }}>
            <Receipt size={15} />
          </div>
          <div className="als-orbit-node" style={{ animationDelay: '-11.25s' }}>
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
          <div className="als-wordmark text-xl font-black tracking-[0.16em] uppercase text-[#f5f1e8]">
            SAB<span>USH</span>
          </div>
          <p className="mt-2 text-xs font-semibold text-slate-400 animate-pulse">{message}</p>
        </div>

        <div className="relative w-[160px] h-[3px] rounded-full bg-white/10 overflow-hidden">
          <div className="als-bar-fill" />
        </div>
      </div>
    </div>
  );
}
