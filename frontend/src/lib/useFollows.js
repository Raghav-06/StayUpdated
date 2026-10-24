import { createContext, useContext } from 'react'

// Filled by FollowsProvider (follows.jsx).
export const FollowsContext = createContext(null)

export function useFollows() {
  return useContext(FollowsContext)
}
