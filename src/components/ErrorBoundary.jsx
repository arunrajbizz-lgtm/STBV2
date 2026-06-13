import React from 'react';
import { AlertTriangle, RefreshCcw, Home } from 'lucide-react';
import { APP_NAME } from '../utils/constants';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("--- POOMANI CRASH DETECTED ---");
    console.error("Error:", error);
    console.error("Error Info:", errorInfo);
  }

  render() {
    if (this.state.hasError) {
      console.log("[Maintenance] Triggered. Error:", this.state.error);
      return (
        <div className="fixed inset-0 bg-red-950 text-white p-20 font-mono overflow-auto z-[9999]">
          <h1 className="text-4xl font-black mb-10 text-red-500">--- DIAGNOSTIC MODE: Maintenance Triggered ---</h1>
          
          <div className="bg-black/40 p-10 rounded-3xl border border-red-500/30 mb-10">
            <h2 className="text-xl font-bold mb-4 uppercase tracking-widest text-red-400">Crash Summary:</h2>
            <p className="text-2xl mb-4">{this.state.error?.message || "Unknown Error"}</p>
            <pre className="text-red-300/60 text-sm whitespace-pre-wrap">
              {this.state.error?.stack}
            </pre>
          </div>

          <div className="bg-black/40 p-10 rounded-3xl border border-red-500/30">
            <h2 className="text-xl font-bold mb-4 uppercase tracking-widest text-red-400">Raw Error Object:</h2>
            <pre className="text-green-400/80 text-xs">
              {JSON.stringify({
                name: this.state.error?.name,
                message: this.state.error?.message,
                stack: this.state.error?.stack,
                // Add any other properties that might exist on the error object
              }, null, 2)}
            </pre>
          </div>

          <button 
            onClick={() => window.location.reload()}
            className="mt-10 px-10 py-5 bg-white text-black font-black uppercase rounded-xl"
          >
            Attempt Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
