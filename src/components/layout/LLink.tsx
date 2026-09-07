import { Link, NavLink, type LinkProps, type NavLinkProps } from "react-router";
import { localizePath, useLocale } from "@/i18n/core";

/** Link that keeps the current locale prefix. `to` is an unprefixed path. */
export function LLink({ to, ...props }: Omit<LinkProps, "to"> & { to: string }) {
  const locale = useLocale();
  return <Link to={localizePath(to, locale)} {...props} />;
}
export function LNavLink({ to, ...props }: Omit<NavLinkProps, "to"> & { to: string }) {
  const locale = useLocale();
  return <NavLink to={localizePath(to, locale)} {...props} />;
}
