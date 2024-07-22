import { main } from "./falang/main";
import { Apis } from "./falang/_falang";

const apis: Apis = {
  Api1: {
    Concat: {
      Object2Concat: async (params) => {
        return params.a.a + params.b.a;
      },
      StringConcat: async (params) => {
        return params.a + params.b + params.c;
      },
    },
    Sum: {
      NumberSum: async(params) => {
        return params.a + params.b + params.c;
      },
      ObjectsSum: async (params) => {
        return params.a.x + params.b.y;
      },
    }
  },
  Api2: {
    BuildObject: {
      BuildObject1: async (params) => {
        return {
          x: params.x,
          y: params.y,
          z: params.z,
        };
      },
      BuildObject2: async (params) => {
        return {
          a: params.a,
          b: params.b,
        }
      },
    }
  }
}

main({
  _falangGlobal: {
    apis
  }
});