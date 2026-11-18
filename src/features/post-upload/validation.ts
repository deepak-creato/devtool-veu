/** Only limits stated in the backend contract. The server stays the authority. */
export const LIMITS = { minFiles: 1, maxFiles: 10, maxPromptLength: 2000 } as const

export function validateSelection(files: File[], thumbnail?: File, prompt?: string): string[] {
  const errors: string[] = []
  if (files.length < LIMITS.minFiles || files.length > LIMITS.maxFiles)
    errors.push(`Select between ${LIMITS.minFiles} and ${LIMITS.maxFiles} files.`)
  // Content-Type must equal mime_type exactly, so an unknown type cannot be uploaded.
  for (const f of [...files, ...(thumbnail ? [thumbnail] : [])])
    if (!f.type) errors.push(`"${f.name}" has an unknown file type.`)
  if (prompt && prompt.length > LIMITS.maxPromptLength)
    errors.push(`Prompt must be at most ${LIMITS.maxPromptLength} characters.`)
  return errors
}
