import { Component, type ErrorInfo, type ReactNode } from 'react';
import { bootLogger } from '@/lib/bootLogger';

interface BootErrorBoundaryProps {
  children: ReactNode;
}

interface BootErrorBoundaryState {
  error: Error | null;
}

export class BootErrorBoundary extends Component<BootErrorBoundaryProps, BootErrorBoundaryState> {
  state: BootErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): BootErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    bootLogger.fatal('react', 'React tree crashed during startup', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
  }

  componentDidMount() {
    bootLogger.once('react:error-boundary-mounted', () => {
      bootLogger.step('react', 'Boot error boundary mounted');
    });
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '32px 20px',
          background: 'linear-gradient(180deg, #ffffff 0%, #fafafa 100%)',
          color: '#171717',
        }}
      >
        <div
          style={{
            width: 'min(720px, 100%)',
            borderRadius: 20,
            border: '1px solid rgba(23, 23, 23, 0.08)',
            background: '#ffffff',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.08)',
            padding: 24,
          }}
        >
          <p style={{ margin: 0, color: '#d93a3a', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Startup failed
          </p>
          <h1 style={{ margin: '10px 0 0', fontSize: 32, lineHeight: 1.1 }}>
            The app crashed during initial loading.
          </h1>
          <p style={{ margin: '14px 0 0', color: '#525252', lineHeight: 1.6 }}>
            Open the startup log in the bottom-right corner to see the exact boot sequence and captured errors.
          </p>
          <pre
            style={{
              margin: '18px 0 0',
              padding: 16,
              borderRadius: 14,
              background: '#fafafa',
              border: '1px solid rgba(23, 23, 23, 0.08)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              color: '#262626',
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            {this.state.error.message}
          </pre>
        </div>
      </div>
    );
  }
}