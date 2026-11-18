import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { Banner, ConnectionContext } from '../../components/ui'
import { useOnline } from '../../lib/use-online'

/*
 * Task 6-4: while the browser is offline, one notice says so, and action buttons that need the
 * server are disabled (ConnectionContext, read by Button). Nothing is promised offline: no queued
 * saves and no offline copies (D7). The notice clears itself when the connection is back.
 *
 * Where it shows: inside a workspace, in the shell's banner slot (OfflineNotice, rendered by
 * LiveShell), so it sits in the content area of all four workspace shells. Pages without a shell
 * (sign-in, lessons, quizzes, public pages) get it at the top of the page instead. A shell
 * registers itself, so the two never show together.
 */
const ShellSlotContext = createContext<((delta: number) => void) | null>(null)

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const online = useOnline()
  const [shells, setShells] = useState(0)
  const register = useCallback((delta: number) => setShells((count) => count + delta), [])
  return (
    <ConnectionContext.Provider value={online}>
      <ShellSlotContext.Provider value={register}>
        {online || shells > 0 ? null : (
          <div className="offline-notice">
            <OfflineBanner />
          </div>
        )}
        {children}
      </ShellSlotContext.Provider>
    </ConnectionContext.Provider>
  )
}

function OfflineBanner() {
  return (
    <Banner tone="warning" icon="wifiOff" flush>
      You&apos;re offline. Saving and other changes are paused until your connection is back.
    </Banner>
  )
}

/** The offline notice for a workspace shell's banner slot. */
export function OfflineNotice() {
  const online = useContext(ConnectionContext)
  const register = useContext(ShellSlotContext)
  useEffect(() => {
    if (!register) return
    register(1)
    return () => register(-1)
  }, [register])
  return online ? null : <OfflineBanner />
}
