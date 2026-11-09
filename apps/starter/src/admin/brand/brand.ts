// The admin's brand: the name and the welcome line on the login page. The mark (the square "N")
// is in Mark.tsx and copies the site icon `src/app/(frontend)/icon.svg`. To rebrand the admin,
// change these values and Mark.tsx. Logo.tsx shows the "Site name" from Site Settings when it is set.
export const BRAND = {
  name: 'Northwind Studio',
  welcome: 'Welcome back. Sign in to edit your site.',
} as const
