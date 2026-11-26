export type AuthenticatedRoute = 'mine' | 'tickets' | 'users' | 'reports' | 'settings';
export type AppRoute = AuthenticatedRoute | 'home' | 'login';

const routePaths: Record<AppRoute, string> = {
  home: '/home',
  login: '/login',
  mine: '/tickets/mine',
  tickets: '/tickets/all',
  users: '/admin/users',
  reports: '/admin/reports',
  settings: '/admin/settings',
};

export function routeHref(route: AppRoute) {
  return `#${routePaths[route]}`;
}

export function routeFromHash(hash: string): AppRoute {
  const path = hash.replace(/^#/, '');
  const route = Object.entries(routePaths).find(([, routePath]) => routePath === path)?.[0];
  return (route as AppRoute | undefined) ?? 'home';
}
