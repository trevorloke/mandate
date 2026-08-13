// Personas — who is looking at the product shapes what the product shows.
// A user may carry an explicit `persona`; when null it derives from role.
// 'candidate' is never derived — it is only ever set explicitly.
export const PERSONAS = ['manager', 'staff', 'candidate', 'volunteer'];

export function effectivePersona(user) {
  const p = user?.persona;
  if (PERSONAS.includes(p)) return p;
  switch (user?.role) {
    case 'super_admin':
    case 'admin':
      return 'manager';
    case 'editor':
      return 'staff';
    default:
      return 'volunteer';
  }
}
