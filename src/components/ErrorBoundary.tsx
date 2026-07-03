import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Trash2, ShieldAlert } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an uncaught exception:", error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    try {
      window.location.href = window.location.pathname + '?cb=' + Date.now();
    } catch (e) {
      window.location.reload();
    }
  };

  private handleClearAndReload = () => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.clear();
      }
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.clear();
      }
      
      // Clear Service Workers if present to bypass broken preview assets caching
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const registration of registrations) {
            registration.unregister();
          }
        });
      }
      
      window.location.href = window.location.pathname + '?cb=' + Date.now();
    } catch (e) {
      window.location.reload();
    }
  };

  private handleLoadDemo = () => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('sabush_demo_session', 'true');
      }
      window.location.href = window.location.pathname + '?cb=' + Date.now();
    } catch (e) {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-screen flex items-center justify-center p-4 bg-slate-50 font-sans">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 md:p-8 shadow-xl border border-slate-100 flex flex-col gap-6 animate-in fade-in zoom-in duration-200">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="p-4 bg-rose-50 text-rose-600 rounded-full">
                <AlertTriangle size={36} className="animate-pulse" />
              </div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">
                Oops! Ocorreu um problema ao carregar
              </h1>
              <p className="text-sm font-medium text-slate-500">
                O Sabush System ERP encontrou um erro no seu navegador. Isso geralmente acontece devido a ficheiros desatualizados no cache ou restrições de armazenamento local.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-xs space-y-2">
              <div className="flex items-center gap-1.5 text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">
                <ShieldAlert size={12} />
                <span>Detalhes do Erro</span>
              </div>
              <p className="font-mono text-slate-700 break-all leading-relaxed font-bold">
                {this.state.error?.toString() || 'Erro desconhecido de runtime'}
              </p>
              {this.state.errorInfo && (
                <details className="cursor-pointer text-slate-400 mt-1 select-none">
                  <summary className="hover:text-slate-600 transition-colors">Ver pilha de execução</summary>
                  <pre className="font-mono text-[9px] mt-2 whitespace-pre-wrap overflow-x-auto text-slate-500 max-h-32 text-left leading-normal border-t pt-2 border-slate-200/50">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                onClick={this.handleReload}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-2xl shadow-lg shadow-blue-500/10 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
              >
                <RefreshCw size={16} />
                Recarregar Aplicação
              </button>

              <button
                onClick={this.handleClearAndReload}
                className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold text-xs rounded-2xl flex items-center justify-center gap-2 transition-all"
              >
                <Trash2 size={14} className="text-slate-400 font-medium" />
                Limpar Cache & Forçar Recarregamento
              </button>

              <button
                onClick={this.handleLoadDemo}
                className="w-full py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-2xl flex items-center justify-center gap-1.5 transition-all"
              >
                Ativar Sessão Demo de Teste
              </button>
            </div>

            <div className="text-center">
              <span className="text-[10px] font-extrabold text-slate-300 uppercase tracking-widest">
                Sabush System ERP • Auto-Recuperação
              </span>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
