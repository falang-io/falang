/**
 * Hand-written driver for the `call-api` compile-and-run test — the cpp analogue of the old app's
 * own hand-written `old/resources/test-projects/api/code/cpp/src/main.cpp` (never generated: `call-api`
 * only ever produces an interface, see `api-project.fixture.ts`'s own top comment). Implements the
 * three abstract classes `compileCppProject` generates from the fixture's `external-api-structure`
 * documents (`ISum`/`IConcat`/`IBuildObject`), wires them into the `extern` globals the generated
 * `call-api` call sites dereference, then calls the compiled entry function directly — this file's
 * own `main()` is the program's only `main()` (the compiled artifact has none, since no
 * `entryDocumentId` is passed for this project; see `compile-and-run-api.test.ts`).
 */
export const CPP_API_DRIVER = `
class ApiSumImpl : public ISum {
 public:
  int ObjectsSum(Object1 a, Object1 b) { return a.x + b.y; }
  int NumberSum(int a, int b, int c) { return a + b + c; }
};

class ApiConcatImpl : public IConcat {
 public:
  std::string Object2Concat(Object2 a, Object2 b) { return a.a + b.a; }
  std::string StringConcat(std::string a, std::string b, std::string c) { return a + b + c; }
};

class ApiBuildObjectImpl : public IBuildObject {
 public:
  Object1 BuildObject1(int x, int y, int z) { return Object1{x, y, z}; }
  Object2 BuildObject2(std::string a, std::string b) { return Object2{a, b}; }
};

ApiSumImpl g_apiSumImpl;
ApiConcatImpl g_apiConcatImpl;
ApiBuildObjectImpl g_apiBuildObjectImpl;

ISum* g_Sum = &g_apiSumImpl;
IConcat* g_Concat = &g_apiConcatImpl;
IBuildObject* g_BuildObject = &g_apiBuildObjectImpl;

int main() {
  runApiTests();
  return 0;
}
`;
