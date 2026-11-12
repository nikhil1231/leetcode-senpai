// Prebuilt widget modules (public/widgets/**) are real ES modules with their own React; the bundler must leave them alone.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const importWidget = (url: string): Promise<any> => import(/* webpackIgnore: true */ url);
