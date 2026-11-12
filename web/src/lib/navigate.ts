// Navigation for code that lives outside the Next router's React tree (the legacy bridge, small React roots mounted
// into imperative views). The shell registers the real router once on mount.
type Nav = { push: (path: string) => void; replace: (path: string) => void };
let nav: Nav = { push: (p) => { window.location.assign(p); }, replace: (p) => { window.location.replace(p); } };
export const setNavigator = (n: Nav) => { nav = n; };
export const navigate = (path: string) => nav.push(path);
export const replaceRoute = (path: string) => nav.replace(path);
