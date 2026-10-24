// Password rules, shown as a checklist under the password field and checked before submitting.
export const PASSWORD_RULES = [
  ['8+ characters', (p) => p.length >= 8],
  ['A letter', (p) => /[a-zA-Z]/.test(p)],
  ['A number', (p) => /\d/.test(p)],
]

export function passwordIsValid(password) {
  return PASSWORD_RULES.every(([, test]) => test(password))
}
