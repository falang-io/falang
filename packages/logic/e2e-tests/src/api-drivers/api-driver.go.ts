/**
 * Hand-written driver for the Go `call-api` compile-and-run test — see `api-driver.cpp.ts`'s own
 * top comment for why this exists at all (`call-api` only ever generates an interface, never a real
 * implementation). Struct field names are capitalized (`X`/`Y`/`Z`, `A`/`B`) to match what
 * `emitGoStructDeclarations` actually declares — Go only exports a field starting with an uppercase
 * letter, so a struct literal here has to agree with the generated declaration.
 */
export const GO_API_DRIVER = `
type apiSumImpl struct{}

func (apiSumImpl) ObjectsSum(a Object1, b Object1) int32 { return a.X + b.Y }
func (apiSumImpl) NumberSum(a int32, b int32, c int32) int32 { return a + b + c }

type apiConcatImpl struct{}

func (apiConcatImpl) Object2Concat(a Object2, b Object2) string { return a.A + b.A }
func (apiConcatImpl) StringConcat(a string, b string, c string) string { return a + b + c }

type apiBuildObjectImpl struct{}

func (apiBuildObjectImpl) BuildObject1(x int32, y int32, z int32) Object1 {
  return Object1{X: x, Y: y, Z: z}
}
func (apiBuildObjectImpl) BuildObject2(a string, b string) Object2 {
  return Object2{A: a, B: b}
}

func main() {
  GSum = apiSumImpl{}
  GConcat = apiConcatImpl{}
  GBuildObject = apiBuildObjectImpl{}
  runApiTests()
}
`;
