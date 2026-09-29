/**
 * Hand-written driver for the Rust `call-api` compile-and-run test — see `api-driver.cpp.ts`'s own top
 * comment for why this exists at all. ADR 0019 (private)'s "Rust target — old-app layout" pass
 * replaced the previous per-API-trait/`OnceLock`-static design with one flattened `Apis` trait
 * (`falang::falang_global::Apis`, `&mut self` methods, one `<ApiDoc>_<Group>_<Endpoint>` method per
 * `call-api` endpoint) threaded as a plain `_apis` parameter through every compiled function instead —
 * this driver implements that single trait directly on one unit struct, rather than one trait/struct
 * pair per API as the previous version did. Struct field names stay lowercase here (unlike the Go
 * driver) — `emit-rust-struct-declarations.ts` needs no capitalization transform, Rust field visibility
 * isn't name-based. Struct-typed parameters are now `&`-references (`Object1`/`Object2` declared in the
 * `Objects` document, so `crate::falang::Objects::Object1`/`crate::falang::Objects::Object2`) — reading
 * a field through the reference works via auto-deref (`a.x`), but *returning* a field's own `String`
 * value needs an explicit `.clone()` first (`a.a.clone() + &b.a`), since it can't be moved out of a
 * borrowed struct.
 */
export const RUST_API_DRIVER = `
mod falang;
extern crate alloc;

struct ApiImpl;

impl falang::falang_global::Apis for ApiImpl {
  fn Api1_Sum_ObjectsSum(&mut self, a: &crate::falang::Objects::Object1, b: &crate::falang::Objects::Object1) -> i32 {
    a.x + b.y
  }
  fn Api1_Sum_NumberSum(&mut self, a: i32, b: i32, c: i32) -> i32 {
    a + b + c
  }
  fn Api1_Concat_Object2Concat(&mut self, a: &crate::falang::Objects::Object2, b: &crate::falang::Objects::Object2) -> alloc::string::String {
    a.a.clone() + &b.a
  }
  fn Api1_Concat_StringConcat(&mut self, a: alloc::string::String, b: alloc::string::String, c: alloc::string::String) -> alloc::string::String {
    a + &b + &c
  }
  fn Api2_BuildObject_BuildObject1(&mut self, x: i32, y: i32, z: i32) -> crate::falang::Objects::Object1 {
    crate::falang::Objects::Object1 { x, y, z }
  }
  fn Api2_BuildObject_BuildObject2(&mut self, a: alloc::string::String, b: alloc::string::String) -> crate::falang::Objects::Object2 {
    crate::falang::Objects::Object2 { a, b }
  }
}

fn main() {
  let mut apis = ApiImpl;
  falang::runApiTests::runApiTests(&mut apis);
}
`;
