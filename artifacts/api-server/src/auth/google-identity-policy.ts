/** Only provider-verified identity fields may authorize an account link. */
export function googleIdentity(input: {sub?: unknown; email?: unknown; email_verified?: unknown; hd?: unknown}) {
  if (typeof input.sub !== 'string' || !input.sub || typeof input.email !== 'string' ||
      !input.email.includes('@') || input.email_verified !== true) {
    throw new Error('Google account email is not verified');
  }
  const email = input.email.trim().toLowerCase();
  // Google is authoritative for Gmail and verified Workspace domains. A
  // verified third-party mailbox alone must not take over an existing account.
  return {id: input.sub, email, authoritativeEmail: email.endsWith('@gmail.com') ||
    (typeof input.hd === 'string' && input.hd.length > 0)};
}

export function canLinkGoogleAccount(existingGoogleId: unknown, identity: ReturnType<typeof googleIdentity>) {
  return existingGoogleId ? existingGoogleId === identity.id : identity.authoritativeEmail;
}
