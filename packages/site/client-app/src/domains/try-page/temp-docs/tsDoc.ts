import { v4 as uuidV4 } from 'uuid';
import { DocumentDto } from '../../api';

export const getTsDoc = (): DocumentDto => {
  return {
    "id": uuidV4(),
    "root": {
      "id": uuidV4(),
      "alias": "function",
      "backgroundColor": "#fff",
      "skewer": {
        "id": uuidV4(),
        "alias": "skewer",
        "backgroundColor": "#fff",
        "children": [
          {
            "id": uuidV4(),
            "alias": "action",
            "backgroundColor": "#ffffff",
            "blockAlias": "text",
            "blockWidth": 256,
            "code": "const roundsTotal = Math.pow(10, 8);"
          },
          {
            "id": uuidV4(),
            "alias": "action",
            "backgroundColor": "#ffffff",
            "blockAlias": "text",
            "blockWidth": 96,
            "code": "const r = 5;"
          },
          {
            "id": uuidV4(),
            "alias": "action",
            "backgroundColor": "#ffffff",
            "blockAlias": "text",
            "blockWidth": 192,
            "code": "const r2= Math.pow(r, 2);"
          },
          {
            "id": uuidV4(),
            "alias": "action",
            "backgroundColor": "#ffffff",
            "blockAlias": "text",
            "code": "let pointsTotal = 0;"
          },
          {
            "id": uuidV4(),
            "alias": "action",
            "backgroundColor": "#ffffff",
            "blockAlias": "text",
            "code": "let pointsInside = 0;"
          },
          {
            "id": uuidV4(),
            "alias": "foreach",
            "backgroundColor": "#ffffff",
            "skewer": {
              "id": uuidV4(),
              "alias": "skewer",
              "backgroundColor": "#ffffff",
              "children": [
                {
                  "id": uuidV4(),
                  "alias": "action",
                  "backgroundColor": "#ffffff",
                  "blockAlias": "text",
                  "blockWidth": 128,
                  "code": "pointsTotal++;"
                },
                {
                  "id": uuidV4(),
                  "alias": "action",
                  "backgroundColor": "#ffffff",
                  "blockAlias": "text",
                  "blockWidth": 256,
                  "code": "const x = Math.random() * r * 2 - r;"
                },
                {
                  "id": uuidV4(),
                  "alias": "action",
                  "backgroundColor": "#ffffff",
                  "blockAlias": "text",
                  "blockWidth": 256,
                  "code": "const y = Math.random() * r * 2 - r;"
                },
                {
                  "id": uuidV4(),
                  "alias": "action",
                  "backgroundColor": "#ffffff",
                  "blockAlias": "text",
                  "blockWidth": 224,
                  "code": "const currentRadius2 = \nMath.pow(x, 2) + Math.pow(y, 2);"
                },
                {
                  "id": uuidV4(),
                  "alias": "if",
                  "backgroundColor": "#ffffff",
                  "blockAlias": "text",
                  "code": "currentRadius2 < r2",
                  "trueIsMain": false,
                  "variants": {
                    "id": uuidV4(),
                    "alias": "skewer_set",
                    "backgroundColor": "#ffffff",
                    "children": [
                      {
                        "id": uuidV4(),
                        "alias": "skewer",
                        "backgroundColor": "#ffffff",
                        "children": []
                      },
                      {
                        "id": uuidV4(),
                        "alias": "skewer",
                        "backgroundColor": "#ffffff",
                        "children": [
                          {
                            "id": uuidV4(),
                            "alias": "action",
                            "backgroundColor": "#ffffff",
                            "blockAlias": "text",
                            "code": "pointsInside++;"
                          }
                        ]
                      }
                    ],
                    "align": "top",
                    "gaps": []
                  }
                }
              ]
            },
            "blockAlias": "text",
            "blockWidth": 224,
            "code": "for(let i = 1; i < roundsTotal; i++)",
            "trueIsMain": false
          },
          {
            "id": uuidV4(),
            "alias": "action",
            "backgroundColor": "#ffffff",
            "blockAlias": "text",
            "blockWidth": 288,
            "code": "const pi = 4 * pointsInside / pointsTotal;"
          },
          {
            "id": uuidV4(),
            "alias": "action",
            "backgroundColor": "#ffffff",
            "blockAlias": "text",
            "blockWidth": 256,
            "code": "console.log(`Calculated PI is: ${pi}`);"
          }
        ]
      },
      "header": {
        "id": uuidV4(),
        "alias": "function_header",
        "backgroundColor": "#fff",
        "blockAlias": "text",
        "code": "export function main()"
      },
      "footer": {
        "id": uuidV4(),
        "alias": "function_footer",
        "backgroundColor": "#fff",
        "blockAlias": "text",
        "code": "return;"
      },
      "file_header": {
        "id": uuidV4(),
        "alias": "file_header",
        "backgroundColor": "#fff",
        "blockAlias": "text",
        "blockWidth": 176,
        "code": "/**\n * Calculate PI using\n * Monte-Carlo algorithm\n **/"
      }
    },
    "name": "Main",
    "description": "",
    "latestVersionHash": "",
    "visibility": "private",
    "icon": "function",
    "projectTemplate": "console_ts",
    "schemeTemplate": "function"
  };
}