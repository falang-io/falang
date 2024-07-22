extern crate rand;
mod falang;

struct ApiRealisation {}

impl crate::falang::falang_global::Apis for ApiRealisation {
    fn Api2_BuildObject_BuildObject1(&mut self,
        x: i32,
        y: i32,
        z: i32,
      ) -> crate::falang::Objects::Object1 {
        falang::Objects::Object1 {
          x,
          y,
          z,
        }
    }

    fn Api2_BuildObject_BuildObject2(&mut self,
        a: String,
        b: String,
      ) -> crate::falang::Objects::Object2 {
        crate::falang::Objects::Object2 {
          a: a.clone(),
          b: b.clone(),
        }
    }

    fn Api1_Sum_NumberSum(&mut self,
        a: i32,
        b: i32,
        c: i32,
      ) -> i32 {
        a + b + c
    }

    fn Api1_Concat_Object2Concat(&mut self,
        a: &crate::falang::Objects::Object2,
        b: &crate::falang::Objects::Object2,
      ) -> String {
        a.a.clone() + &b.a
    }

    fn Api1_Sum_ObjectsSum(&mut self,
        a: &crate::falang::Objects::Object1,
        b: &crate::falang::Objects::Object1,
      ) -> i32 {
        a.x + b.y
    }

    fn Api1_Concat_StringConcat(&mut self,
        a: String,
        b: String,
        c: String,
      ) -> String {
        a + &b + &c
    }
}


fn main() 
{
  let mut api = crate::ApiRealisation{};

  falang::main::main(&mut api);
}
