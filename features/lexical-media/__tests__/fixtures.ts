export function codesOf(issues: readonly { readonly code: string }[]): readonly string[] {
  return issues.map((issue) => issue.code);
}
