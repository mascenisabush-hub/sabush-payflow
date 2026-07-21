import React, { useEffect, useState } from 'react';

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
          background: #0A1C38;
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
          background: #0A1C38;
          filter: blur(90px) saturate(140%);
          opacity: 0.4;
          animation: ws-lamp-spin 18s linear infinite;
          mix-blend-mode: screen;
        }
        @keyframes ws-lamp-spin {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }

        .ws-vignette {
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse at 50% 45%, transparent 0%, transparent 35%, #06142A 82%);
        }

        /* Drifting soft particles for depth */
        .ws-spark {
          position: absolute;
          border-radius: 999px;
          background: rgba(214, 155, 37, 0.65);
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
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(214, 155, 37, 0.35);
          box-shadow: 0 0 60px rgba(184, 121, 26, 0.35);
          opacity: 0;
          animation: ws-pop-in 0.7s 0.15s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        @keyframes ws-pop-in {
          from { opacity: 0; transform: scale(0.4) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }

        .ws-wordmark {
          margin-top: 26px;
          font-family: "Plus Jakarta Sans", "Inter", ui-sans-serif, system-ui, sans-serif;
          font-weight: 800;
          font-size: clamp(2.4rem, 7vw, 3.8rem);
          letter-spacing: 0.02em;
          line-height: 1.05;
          background: #B8791A;
          background-size: 260% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: ws-word-in 0.7s 0.35s cubic-bezier(0.22, 1, 0.36, 1) both, ws-shimmer 5s 1.1s linear infinite;
        }
        @keyframes ws-word-in {
          from { opacity: 0; transform: translateY(16px); filter: blur(6px); }
          to { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        @keyframes ws-shimmer {
          0% { background-position: 0% 50%; }
          100% { background-position: 260% 50%; }
        }

        .ws-headline {
          margin-top: 14px;
          font-size: clamp(1.15rem, 3.2vw, 1.5rem);
          font-weight: 700;
          color: #F4F8FA;
          opacity: 0;
          animation: ws-rise-in 0.6s 0.65s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }

        .ws-tagline {
          margin-top: 10px;
          font-size: clamp(0.95rem, 2.4vw, 1.05rem);
          color: #A8C2EA;
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
          background: #B8791A;
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
          color: rgba(168, 194, 234, 0.65);
          font-size: 0.82rem;
          cursor: pointer;
          text-decoration: underline;
          text-underline-offset: 3px;
          opacity: 0;
          animation: ws-rise-in 0.6s 1.15s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .ws-skip:hover {
          color: #E7B448;
        }

        @media (prefers-reduced-motion: reduce) {
          .ws-lamp { animation: none; }
          .ws-wordmark { animation: ws-word-in 0.4s both; }
          .ws-spark { display: none; }
        }
      `}</style>

      <div className="ws-lamp" />
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
        <div className="ws-mark">
          <img
            src="/sabush-logo.png"
            alt="Sabush Tech"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        </div>

        <h1 className="ws-wordmark">SABUSH TECH</h1>

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
