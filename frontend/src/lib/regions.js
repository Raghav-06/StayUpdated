export const REGIONS = [
  ['IN', 'India'],
  ['US', 'United States'],
  ['GB', 'United Kingdom'],
  ['global', 'Global'],
]

export const DEFAULT_REGION = 'IN'

export function regionLabel(code) {
  return REGIONS.find(([c]) => c === code)?.[1] ?? code
}

// The user's saved default region, else India.
export function preferredRegion(user) {
  const saved = user?.preferences?.region
  return REGIONS.some(([c]) => c === saved) ? saved : DEFAULT_REGION
}
