import { BRAND } from './brand'

/** `admin.components.beforeLogin`: one welcome line between the logo and the login form. */
export function Welcome() {
  return <p className="brand-welcome">{BRAND.welcome}</p>
}
