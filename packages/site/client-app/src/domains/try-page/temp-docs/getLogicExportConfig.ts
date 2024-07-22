import { type ILogicExportConfiguration } from '@falang/editor-scheme';

export const getLogicExportConfig = (): ILogicExportConfiguration => {
  return {
    exports: [
      {
        "language": "ts",
        "path": "./code/ts/src/falang"
      },
      {
        "language": "rust",
        "path": "./code/rust/src/falang"
      },
      {
        "language": "cpp",
        "path": "./code/cpp/src/falang"
      },
      {
        "language": "sharp",
        "path": "./code/csharp/src/Falang"
      },
      {
        "language": "golang",
        "path": "./code/go/falang"
      },
      {
        "language": "js",
        "path": "./code/js/src/falang"
      }
    ]
  };
};
