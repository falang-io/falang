/**
 * Hand-written driver for the C# `call-api` compile-and-run test — see `api-driver.cpp.ts`'s own top
 * comment for why this exists at all. Extends the generated `Program` class via a second `partial
 * class Program` (see `compile-sharp-project.ts`'s own comment on why it's now always `partial`) to
 * add `Main()` and assign each API field before calling into any compiled code that uses it.
 */
export const SHARP_API_DRIVER = `
public class ApiSumImpl : ISum {
  public int NumberSum(int a, int b, int c) { return a + b + c; }
  public int ObjectsSum(Object1 a, Object1 b) { return a.x + b.y; }
}

public class ApiConcatImpl : IConcat {
  public string Object2Concat(Object2 a, Object2 b) { return a.a + b.a; }
  public string StringConcat(string a, string b, string c) { return a + b + c; }
}

public class ApiBuildObjectImpl : IBuildObject {
  public Object1 BuildObject1(int x, int y, int z) { return new Object1 { x = x, y = y, z = z }; }
  public Object2 BuildObject2(string a, string b) { return new Object2 { a = a, b = b }; }
}

public static partial class Program {
  public static void Main() {
    Sum = new ApiSumImpl();
    Concat = new ApiConcatImpl();
    BuildObject = new ApiBuildObjectImpl();
    runApiTests();
  }
}
`;
