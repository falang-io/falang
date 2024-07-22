import { IconDto, LifegramDto, WhileDto } from '@falang/editor-scheme';
import { IfIconDto } from '@falang/editor-scheme';
import { LifegramFunctionIconStore } from '@falang/editor-scheme';
import { ParallelDto } from '@falang/editor-scheme';
import { SwitchDto } from '@falang/editor-scheme';
import { v4 as uuidV4 } from 'uuid';
import { DocumentDto } from '../../api';

export const getMonteCarloDoc = (): IconDto => {

  const iconDto: any = {
    "id": "TJbaB9vPj399tVyisxU6U",
    "alias": "function",
    "header": {
      "text": "Функция по вычислению константы PI методом Монте-карло",
      "width": 160,
      "color": "#ffffff"
    },
    "block": {
      "parameters": [],
      "returnValue": {
        "type": "number",
        "numberType": "float",
        "floatType": "float32"
      },
      "width": 192,
      "name": "calculateMonteCarlo"
    },
    "children": [
      {
        "id": "6TUE7K9NhEMwf2B14TkaD",
        "alias": "create_var",
        "block": {
          "width": 192,
          "color": "#ffffff",
          "expression": "roundsTotal = 10000000",
          "type": "create",
          "variableType": {
            "constant": true,
            "type": "number",
            "numberType": "integer",
            "integerType": "int32",
            "optional": false
          }
        }
      },
      {
        "id": "jPGGFGM1l137CYRy9HONm",
        "alias": "create_var",
        "block": {
          "width": 160,
          "color": "#ffffff",
          "expression": "r = 5",
          "type": "create",
          "variableType": {
            "constant": true,
            "type": "number",
            "numberType": "integer",
            "integerType": "int32",
            "optional": false
          }
        }
      },
      {
        "id": "oFdbfoUJeAJiBiwJI6DL_",
        "alias": "create_var",
        "block": {
          "width": 160,
          "color": "#ffffff",
          "expression": "r2 = r ^ 2",
          "type": "create",
          "variableType": {
            "constant": true,
            "type": "number",
            "numberType": "integer",
            "integerType": "int32",
            "optional": false
          }
        }
      },
      {
        "id": "0_LD19jb5SMddQ4DRDSZv",
        "alias": "create_var",
        "block": {
          "width": 160,
          "color": "#ffffff",
          "expression": "pointsTotal = 0",
          "type": "create",
          "variableType": {
            "constant": false,
            "type": "number",
            "numberType": "integer",
            "integerType": "int32",
            "optional": false
          }
        }
      },
      {
        "id": "ofYgLKDYC5BZ86lfuv0ve",
        "alias": "create_var",
        "block": {
          "width": 128,
          "color": "#ffffff",
          "expression": "pointsInside = 0",
          "type": "create",
          "variableType": {
            "constant": false,
            "type": "number",
            "numberType": "integer",
            "integerType": "int32",
            "optional": false
          }
        }
      },
      {
        "id": "9P_T_81bfQTzV4qdkIW9b",
        "alias": "from_to_cycle",
        "block": {
          "from": "0",
          "to": "roundsTotal",
          "item": "i",
          "width": 160
        },
        "children": [
          {
            "id": "6Hrxv4myLdY5xsczBdbPq",
            "alias": "assign_var",
            "block": {
              "width": 224,
              "color": "#ffffff",
              "expression": "pointsTotal = pointsTotal + 1",
              "type": "assign",
              "variableType": null
            }
          },
          {
            "id": "zNz6zOZ4QWaXothquJlle",
            "alias": "create_var",
            "block": {
              "width": 192,
              "color": "#ffffff",
              "expression": "y = random() * r * 2 - r",
              "type": "create",
              "variableType": {
                "type": "number",
                "numberType": "float",
                "floatType": "float32",
                "constant": false,
                "optional": false
              }
            }
          },
          {
            "id": "YvwldsGRI0ZP_Gz36gXtp",
            "alias": "create_var",
            "block": {
              "width": 192,
              "color": "#ffffff",
              "expression": "x = random() * r * 2 - r",
              "type": "create",
              "variableType": {
                "type": "number",
                "numberType": "float",
                "floatType": "float32",
                "constant": true,
                "optional": false
              }
            }
          },
          {
            "id": "kPfdTNpBaYvtBwY49Fkcl",
            "alias": "create_var",
            "block": {
              "width": 192,
              "color": "#ffffff",
              "expression": "currentR2 = x ^ 2 + y ^ 2",
              "type": "create",
              "variableType": {
                "type": "number",
                "numberType": "float",
                "floatType": "float32",
                "constant": true,
                "optional": false
              }
            }
          },
          {
            "id": "sZLJLtRu_pug3xGeBzF9p",
            "alias": "if",
            "block": {
              "width": 128,
              "color": "#ffffff",
              "expression": "currentR2 < r2",
              "type": "boolean",
              "variableType": null
            },
            "trueOnRight": true,
            "gaps": [],
            "children": [
              {
                "alias": "system",
                "id": "flh-lVQk23zctA487VSvS",
                "block": {
                  "width": 0
                },
                "children": []
              },
              {
                "alias": "system",
                "id": "go7ZSQVYrd-jAl3HYNLcY",
                "block": {
                  "width": 0
                },
                "children": [
                  {
                    "id": "ehv8n35WF4sjn3trZdAaT",
                    "alias": "assign_var",
                    "block": {
                      "width": 256,
                      "color": "#ffffff",
                      "expression": "pointsInside = pointsInside + 1",
                      "type": "assign",
                      "variableType": null
                    }
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "id": "Iy66HcivGhDBKu2gzm59U",
        "alias": "create_var",
        "block": {
          "width": 288,
          "color": "#ffffff",
          "expression": "pi = 4 * pointsInside / pointsTotal",
          "type": "create",
          "variableType": {
            "type": "number",
            "numberType": "float",
            "floatType": "float32",
            "constant": false,
            "optional": false
          }
        }
      },
      {
        "id": "9cglQEf6-1LoMjnKHbSEh",
        "alias": "assign_var",
        "block": {
          "width": 128,
          "color": "#ffffff",
          "expression": "returnValue = pi",
          "type": "assign",
          "variableType": null
        }
      }
    ],
    "footer": {
      "text": "",
      "width": 160,
      "color": "#ffffff"
    }
  }

  return iconDto;
}