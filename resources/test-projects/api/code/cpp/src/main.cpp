#include <stdlib.h>
#include <string>
#include <iostream>
#include "./falang/main.h"
#include "./falang/Api1.h"
#include "./falang/falang_global.h"

class ApiSum: public Falang_Api1::Sum_Class {
  public: 
      int32_t ObjectsSum (Falang_Api1::IObjectsSumParams params) {
        return params.a.x + params.b.y;
      };
      int32_t NumberSum (Falang_Api1::INumberSumParams params) {
        return params.a + params.b + params.c;
      };
};

class ApiConcat: public Falang_Api1::Concat_Class {
      public:
      std::string Object2Concat (Falang_Api1::IObject2ConcatParams params) {
        return params.a.a + params.b.a;
      };
      std::string StringConcat (Falang_Api1::IStringConcatParams params) {
        return params.a + params.b + params.c;
      };
};

class ApiObject: public Falang_Api2::BuildObject_Class {
  public:
    Falang_Objects::Object1 BuildObject1 (Falang_Api2::IBuildObject1Params params) {
      Falang_Objects::Object1 returnValue = {
        params.x,
        params.y,
        params.z,
      };
      return returnValue;
    };
    Falang_Objects::Object2 BuildObject2 (Falang_Api2::IBuildObject2Params params) {
      Falang_Objects::Object2 returnValue = {
        params.a,
        params.b,
      };
      return returnValue;
    };
};
int main() {
  ApiSum apiSum;
  ApiConcat apiConcat;
  ApiObject apiObject;
  Falang_Api1::Falang_Api1_Class apis1 = {
    &apiSum,
    &apiConcat,
  };
  Falang_Api2::Falang_Api2_Class apis2 = {
    &apiObject,
  };
  FalangGlobal::Apis apis = {
    apis2,
    apis1,
  };
  FalangGlobal::FalangGlobal _falangGlobal = {
    apis,
  };
  Falang_main::ImainParams mainParams = { _falangGlobal };
  Falang_main::main(mainParams);
}
