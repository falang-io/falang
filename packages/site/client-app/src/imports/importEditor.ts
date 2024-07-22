export const importEditor = async() => {
  const [
    editor,
    core,
    prism,
    loadLanguages,
  ] = await Promise.all([
    import('@falang/editor-scheme'),
    import('@falang/frontend-core'),
    import('prismjs'),
    import('prismjs/components/'),
  ]);
  return {
    editor, core, prism
  }
}