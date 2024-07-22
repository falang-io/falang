#include <stdlib.h>
#include <string>
#include <iostream>
#include "./falang/falang_global.h"
#include "./falang/main.h"

int main() {
  FalangGlobal::FalangGlobal _falangGlobal;
  Falang_main::ImainParams mainParams = { _falangGlobal };
  Falang_main::main(mainParams);
}
