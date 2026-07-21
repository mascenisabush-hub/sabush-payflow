import React, { useEffect, useState } from 'react';
import { ShoppingCart, Package, Receipt, BarChart3, Leaf } from 'lucide-react';

interface WelcomeSplashProps {
  lang?: string;
  onFinish: () => void;
}

/**
 * Grand, cinematic welcome moment shown once, immediately after the loading
 * screen resolves and before the dashboard renders. Replaces the old
 * react-joyride tooltip with a full-screen brand reveal: a slowly rotating
 * "lamp" of colour behind the mark, a shimmering animated wordmark, and a
 * staggered entrance for the tagline and CTA.
 *
 * Fully self-contained (inline <style>, no extra deps).
 */
export default function WelcomeSplash({ lang = 'pt', onFinish }: WelcomeSplashProps) {
  const [closing, setClosing] = useState(false);
  const isPt = lang === 'pt';

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const handleFinish = () => {
    setClosing(true);
    window.setTimeout(onFinish, 520);
  };

  return (
    <div
      className={`ws-root ${closing ? 'ws-closing' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={isPt ? 'Bem-vindo ao Sabush ERP' : 'Welcome to Sabush ERP'}
    >
      <style>{`
        .ws-root {
          position: fixed;
          inset: 0;
          z-index: 20000;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          background:
            radial-gradient(ellipse at 50% 8%, rgba(255, 241, 204, 0.9), transparent 55%),
            radial-gradient(circle at 8% 90%, rgba(111, 191, 91, 0.24), transparent 58%),
            radial-gradient(circle at 94% 85%, rgba(63, 145, 66, 0.18), transparent 60%),
            linear-gradient(180deg, #FFFBEF 0%, #FDF3CE 22%, #F3EBC2 42%, #E9F1D4 70%, #DCEBC8 100%);
          animation: ws-fade-in 0.6s ease-out both;
        }
        .ws-root.ws-closing {
          animation: ws-fade-out 0.5s ease-in both;
        }
        @keyframes ws-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes ws-fade-out {
          from { opacity: 1; transform: scale(1); }
          to { opacity: 0; transform: scale(1.03); }
        }

        /* ---- The "lamp": a slowly rotating conic wash of brand + accent colour ---- */
        .ws-lamp {
          position: absolute;
          width: 140vmax;
          height: 140vmax;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: conic-gradient(
            from 0deg,
            #F6D375 0deg,
            #FFF3D0 40deg,
            #8FCB6E 100deg,
            #4E9A4E 150deg,
            #2C63B8 210deg,
            #7CA3E0 260deg,
            #F6D375 320deg,
            #F6D375 360deg
          );
          filter: blur(100px) saturate(140%);
          opacity: 0.34;
          animation: ws-lamp-spin 18s linear infinite;
          mix-blend-mode: multiply;
        }
        @keyframes ws-lamp-spin {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }

        .ws-vignette {
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse at 50% 45%, transparent 0%, transparent 42%, rgba(196, 222, 166, 0.5) 100%);
        }

        /* Rotating sunburst rays, matching the boot splash and loading screen —
           turned up brighter, per the "more shine" note */
        .ws-rays {
          position: absolute;
          width: 660px;
          height: 660px;
          border-radius: 50%;
          background: repeating-conic-gradient(from 0deg, rgba(255,236,168,0.58) 0deg 1.2deg, transparent 1.2deg 9deg);
          mask-image: radial-gradient(circle, transparent 28%, black 46%, transparent 68%);
          -webkit-mask-image: radial-gradient(circle, transparent 28%, black 46%, transparent 68%);
          animation: ws-lamp-spin 44s linear infinite;
          mix-blend-mode: soft-light;
        }

        .ws-shine {
          position: absolute;
          width: 420px;
          height: 420px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255, 250, 220, 0.95), transparent 70%);
          filter: blur(4px);
          animation: ws-shine-breathe 3.2s ease-in-out infinite;
          mix-blend-mode: soft-light;
        }
        @keyframes ws-shine-breathe {
          0%, 100% { opacity: 0.5; transform: scale(0.9); }
          50% { opacity: 1; transform: scale(1.1); }
        }

        /* Comet rings + orbiting module hex-badges around the mark */
        .ws-mark-wrap { position: relative; width: 168px; height: 168px; display: flex; align-items: center; justify-content: center; }
        .ws-ring-svg { position: absolute; inset: 0; overflow: visible; }
        .ws-ring-svg.cw { animation: ws-spin 24s linear infinite; }
        .ws-ring-svg.ccw { animation: ws-spin-rev 30s linear infinite; }
        @keyframes ws-spin { to { transform: rotate(360deg); } }
        @keyframes ws-spin-rev { to { transform: rotate(-360deg); } }
        .ws-orbit-node {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 36px;
          height: 36px;
          margin: -18px;
          clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 15px;
          background: linear-gradient(160deg, #0d1e3a, #071224);
          filter: drop-shadow(0 0 8px var(--node-glow, rgba(184,121,26,0.6))) drop-shadow(0 6px 10px rgba(11,27,51,0.25));
          opacity: 0;
          animation: ws-orbit 17s linear infinite, ws-node-in 0.5s 0.5s ease-out forwards;
        }
        .ws-orbit-node::before {
          content: "";
          position: absolute;
          inset: 0;
          clip-path: inherit;
          padding: 1.3px;
          background: linear-gradient(160deg, var(--node-c, #f5c877), transparent 55%, var(--node-c, #f5c877));
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
        }
        @keyframes ws-orbit {
          from { transform: rotate(0deg) translateX(80px) rotate(0deg); }
          to   { transform: rotate(360deg) translateX(80px) rotate(-360deg); }
        }
        @keyframes ws-node-in { to { opacity: 1; } }

        /* Drifting soft particles for depth */
        .ws-spark {
          position: absolute;
          border-radius: 999px;
          background: rgba(184, 121, 26, 0.55);
          filter: blur(1px);
          animation: ws-drift linear infinite;
        }
        @keyframes ws-drift {
          0% { transform: translateY(0) scale(1); opacity: 0; }
          10% { opacity: 0.9; }
          90% { opacity: 0.6; }
          100% { transform: translateY(-90vh) scale(1.4); opacity: 0; }
        }

        .ws-content {
          position: relative;
          z-index: 2;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 32px;
          max-width: 640px;
        }

        .ws-mark {
          width: 84px;
          height: 84px;
          border-radius: 22px;
          padding: 14px;
          background: rgba(255,255,255,0.65);
          border: 1px solid rgba(214, 155, 37, 0.4);
          box-shadow: 0 0 50px rgba(184, 121, 26, 0.28), 0 10px 26px rgba(11, 27, 51, 0.12);
          opacity: 0;
          animation: ws-pop-in 0.7s 0.15s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        @keyframes ws-pop-in {
          from { opacity: 0; transform: scale(0.4) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }

        .ws-wordmark {
          position: relative;
          margin-top: 26px;
          font-family: "Plus Jakarta Sans", "Inter", ui-sans-serif, system-ui, sans-serif;
          font-weight: 800;
          font-size: clamp(2.4rem, 7vw, 3.8rem);
          letter-spacing: 0.02em;
          line-height: 1.05;
          color: #0B1B33;
          opacity: 0;
          animation: ws-word-in 0.7s 0.35s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .ws-wordmark::after {
          content: attr(data-text);
          position: absolute;
          inset: 0;
          background: linear-gradient(100deg, transparent 22%, rgba(255,255,255,0.9) 42%, #E7B448 49%, rgba(255,255,255,0.9) 56%, transparent 76%);
          background-size: 240% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: ws-shimmer 4.2s 1.05s linear infinite;
          mix-blend-mode: overlay;
        }
        @keyframes ws-word-in {
          from { opacity: 0; transform: translateY(16px); filter: blur(6px); }
          to { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        @keyframes ws-shimmer {
          0% { background-position: 240% 50%; }
          100% { background-position: -240% 50%; }
        }

        .ws-headline {
          margin-top: 14px;
          font-size: clamp(1.15rem, 3.2vw, 1.5rem);
          font-weight: 700;
          color: #0B1B33;
          opacity: 0;
          animation: ws-rise-in 0.6s 0.65s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }

        .ws-tagline {
          margin-top: 10px;
          font-size: clamp(0.95rem, 2.4vw, 1.05rem);
          color: #3F5A7A;
          max-width: 460px;
          line-height: 1.55;
          opacity: 0;
          animation: ws-rise-in 0.6s 0.85s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }

        @keyframes ws-rise-in {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .ws-cta {
          margin-top: 32px;
          opacity: 0;
          animation: ws-rise-in 0.6s 1.05s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }

        .ws-btn {
          position: relative;
          padding: 14px 38px;
          border-radius: 999px;
          font-weight: 700;
          font-size: 0.95rem;
          letter-spacing: 0.01em;
          color: #06142A;
          background: linear-gradient(120deg, #D69B25, #E7B448 45%, #D69B25 100%);
          border: none;
          cursor: pointer;
          box-shadow: 0 8px 30px rgba(184, 121, 26, 0.45), 0 0 0 1px rgba(255,255,255,0.08) inset;
          transition: transform 0.18s ease, box-shadow 0.18s ease;
        }
        .ws-btn:hover {
          transform: translateY(-2px) scale(1.02);
          box-shadow: 0 12px 38px rgba(184, 121, 26, 0.6), 0 0 0 1px rgba(255,255,255,0.12) inset;
        }
        .ws-btn:active {
          transform: translateY(0) scale(0.98);
        }

        .ws-skip {
          margin-top: 16px;
          background: none;
          border: none;
          color: rgba(11, 27, 51, 0.55);
          font-size: 0.82rem;
          cursor: pointer;
          text-decoration: underline;
          text-underline-offset: 3px;
          opacity: 0;
          animation: ws-rise-in 0.6s 1.15s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .ws-skip:hover {
          color: #B8791A;
        }

        @media (prefers-reduced-motion: reduce) {
          .ws-lamp, .ws-rays, .ws-shine, .ws-ring-svg, .ws-orbit-node { animation: none; opacity: 1; }
          .ws-wordmark { animation: ws-word-in 0.4s both; }
          .ws-wordmark::after { animation: none; }
          .ws-spark { display: none; }
        }
      `}</style>

      <div className="ws-lamp" />
      <div className="ws-rays" />
      <div className="ws-shine" />
      <div className="ws-vignette" />

      {[...Array(14)].map((_, i) => (
        <div
          key={i}
          className="ws-spark"
          style={{
            left: `${(i * 7.3) % 100}%`,
            width: `${3 + (i % 4)}px`,
            height: `${3 + (i % 4)}px`,
            animationDuration: `${9 + (i % 6) * 1.6}s`,
            animationDelay: `${i * 0.4}s`,
          }}
        />
      ))}

      <div className="ws-content">
        <div className="ws-mark-wrap">
          <svg className="ws-ring-svg cw" viewBox="0 0 168 168" aria-hidden="true">
            <circle cx="84" cy="84" r="80" fill="none" stroke="rgba(184,121,26,0.3)" strokeWidth="1.2" strokeDasharray="2 9" />
            <circle cx="84" cy="84" r="80" fill="none" stroke="#B8791A" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="14 488" style={{ filter: 'drop-shadow(0 0 6px #f5c877)' }} />
            <circle cx="84" cy="84" r="58" fill="none" stroke="rgba(63,145,66,0.3)" strokeWidth="1" strokeDasharray="1 10" />
            <circle cx="84" cy="84" r="58" fill="none" stroke="#3F9142" strokeWidth="2" strokeLinecap="round" strokeDasharray="8 356" style={{ filter: 'drop-shadow(0 0 6px #8FCB6E)' }} />
          </svg>
          <svg className="ws-ring-svg ccw" viewBox="0 0 168 168" aria-hidden="true">
            <circle cx="84" cy="84" r="68" fill="none" stroke="rgba(44,99,184,0.26)" strokeWidth="1" strokeDasharray="1 12" />
            <circle cx="84" cy="84" r="68" fill="none" stroke="#2C63B8" strokeWidth="2" strokeLinecap="round" strokeDasharray="10 417" style={{ filter: 'drop-shadow(0 0 6px #7CA3E0)' }} />
          </svg>

          <div className="ws-orbit-node" style={{ ['--node-c' as any]: '#f5c877', ['--node-glow' as any]: 'rgba(214,155,37,0.6)', color: '#f5c877', animationDelay: '0s, 0.5s' }}>
            <ShoppingCart size={15} />
          </div>
          <div className="ws-orbit-node" style={{ ['--node-c' as any]: '#7CA3E0', ['--node-glow' as any]: 'rgba(44,99,184,0.6)', color: '#7CA3E0', animationDelay: '-3.4s, 0.65s' }}>
            <Package size={15} />
          </div>
          <div className="ws-orbit-node" style={{ ['--node-c' as any]: '#D69B25', ['--node-glow' as any]: 'rgba(214,155,37,0.6)', color: '#D69B25', animationDelay: '-6.8s, 0.8s' }}>
            <Receipt size={15} />
          </div>
          <div className="ws-orbit-node" style={{ ['--node-c' as any]: '#60a5fa', ['--node-glow' as any]: 'rgba(44,99,184,0.6)', color: '#60a5fa', animationDelay: '-10.2s, 0.95s' }}>
            <BarChart3 size={15} />
          </div>
          <div className="ws-orbit-node" style={{ ['--node-c' as any]: '#6FBF5B', ['--node-glow' as any]: 'rgba(63,145,66,0.6)', color: '#6FBF5B', animationDelay: '-13.6s, 1.1s' }}>
            <Leaf size={15} />
          </div>

          <div className="ws-mark">
            <img
              src="/sabush-logo.png"
              alt="Sabush Tech"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>
        </div>

        <h1 className="ws-wordmark" data-text="SABUSH TECH">SABUSH TECH</h1>

        <p className="ws-headline">
          {isPt ? 'Bem-vindo ao Sabush ERP!' : 'Welcome to Sabush ERP!'}
        </p>

        <p className="ws-tagline">
          {isPt
            ? 'A sua plataforma inteligente para gerir e otimizar o seu negócio — construída com inovação e propósito, para África.'
            : 'Your smart platform to manage and optimize your business — built with innovation and purpose, for Africa.'}
        </p>

        <div className="ws-cta">
          <button className="ws-btn" onClick={handleFinish}>
            {isPt ? 'Vamos começar' : "Let's begin"}
          </button>
        </div>

        <button className="ws-skip" onClick={handleFinish}>
          {isPt ? 'Saltar' : 'Skip'}
        </button>
      </div>
    </div>
  );
}
