using Falang.Api1;
using Falang.Api2;
using Falang.Objects;

var apis = new Falang.Global.Apis() {
  Api1 = new Falang.Api1.Api1 {
    Concat = new ApisConcat(),
    Sum = new ApisSum(),
  },
  Api2 = new Falang.Api2.Api2 {
    BuildObject = new ObjCreator(),
  }
};

var _falangGlobal = new Falang.Global.FalangGlobal() {
  apis = apis,
};
var mainParams = new Falang.main.ImainParams() {
  _falangGlobal = _falangGlobal,
};
Falang.main.MethodClass.main(mainParams);



class ApisSum : Falang.Api1.Sum
{
  public int NumberSum(INumberSumParams _params)
  {
    return _params.a + _params.b + _params.c;
  }

  public int ObjectsSum(IObjectsSumParams _params)
  {
    return _params.a.x + _params.b.y;
  }
}

class ApisConcat : Falang.Api1.Concat
{
  public string Object2Concat(IObject2ConcatParams _params)
  {
    return _params.a.a + _params.b.a;
  }

  public string StringConcat(IStringConcatParams _params)
  {
    return _params.a + _params.b + _params.c;
  }
}

class ObjCreator : Falang.Api2.BuildObject
{
  public Object1 BuildObject1(IBuildObject1Params _params)
  {
    return new Object1 {
      x = _params.x,
      y = _params.y,
      z = _params.z,
    };
  }

  public Object2 BuildObject2(IBuildObject2Params _params)
  {
    return new Object2 {
      a = _params.a,
      b = _params.b,
    };
  }
}
