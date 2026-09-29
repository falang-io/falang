/// <reference types="astro/client" />

// Starlight's virtual config module has no shipped ambient type declaration for consumers
// overriding its components (src/components/header.astro) — declared loosely here, just enough
// for the fields that component actually reads.
declare module 'virtual:starlight/user-config' {
  const config: {
    pagefind: boolean;
    components: Record<string, string>;
    [key: string]: unknown;
  };
  export default config;
}
