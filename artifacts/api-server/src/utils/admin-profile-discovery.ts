/** These optional self-declared details are exposed only by the authenticated admin response. */
export function adminProfileDiscovery(user: { preferences?: Record<string, unknown> }) {
  const preferences = user.preferences || {};
  const gender = preferences.profileGender;
  const country = preferences.profileCountryCode;
  return {
    profileGender: typeof gender === 'string' && ['female','male','other','undisclosed'].includes(gender) ? gender : null,
    profileCountryCode: typeof country === 'string' && /^[A-Z]{2}$/.test(country) ? country : null,
  };
}
