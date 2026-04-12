import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { BootErrorBoundary } from './components/BootErrorBoundary.tsx'
import { AuthProvider } from './contexts/AuthContext.tsx'
import { LocaleProvider } from './contexts/LocaleContext.tsx'
import { bootLogger } from './lib/bootLogger.ts'

bootLogger.once('bootstrap:module-evaluated', () => {
  bootLogger.step('bootstrap', 'main.tsx evaluated', {
    mode: import.meta.env.MODE,
    url: window.location.href,
    pathname: window.location.pathname,
    language: navigator.language,
    online: navigator.onLine,
    userAgent: navigator.userAgent,
  })
})

const rootElement = document.getElementById('root')

if (!rootElement) {
  bootLogger.fatal('bootstrap', 'Root element #root was not found in the document')
  throw new Error('Root element #root was not found')
}

bootLogger.step('bootstrap', 'Root element located', {
  id: rootElement.id,
})

const root = createRoot(rootElement, {
  onCaughtError(error, errorInfo) {
    bootLogger.fatal('react', 'React caught an error during rendering', {
      error,
      componentStack: errorInfo.componentStack,
    })
  },
  onRecoverableError(error, errorInfo) {
    bootLogger.warn('react', 'React reported a recoverable error', {
      error,
      componentStack: errorInfo.componentStack,
    })
  },
  onUncaughtError(error, errorInfo) {
    bootLogger.fatal('react', 'React reported an uncaught error', {
      error,
      componentStack: errorInfo.componentStack,
    })
  },
})

bootLogger.step('bootstrap', 'React root created')

root.render(
  <StrictMode>
    <BootErrorBoundary>
      <LocaleProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </LocaleProvider>
    </BootErrorBoundary>
  </StrictMode>,
)

bootLogger.step('bootstrap', 'React render requested')

queueMicrotask(() => {
  bootLogger.once('bootstrap:first-microtask', () => {
    bootLogger.step('bootstrap', 'First microtask after render request completed')
  })
})

requestAnimationFrame(() => {
  bootLogger.once('bootstrap:first-frame', () => {
    bootLogger.step('bootstrap', 'First animation frame after render request completed')
  })
})
