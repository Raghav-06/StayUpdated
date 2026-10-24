import { createContext, useContext } from 'react'

// Filled by HistoryProvider (history.jsx).
export const HistoryContext = createContext(null)

export function useHistory() {
  return useContext(HistoryContext)
}
