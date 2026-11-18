import { createContext, useContext } from 'react'

/*
 * Task 6-4: whether actions can reach the server. The live app provides the browser's online state
 * (live/components/Connection.tsx); everything else (design previews, tests of single components)
 * gets the default, online, so buttons behave exactly as before.
 */
export const ConnectionContext = createContext<boolean>(true)

export function useConnection(): boolean {
  return useContext(ConnectionContext)
}
