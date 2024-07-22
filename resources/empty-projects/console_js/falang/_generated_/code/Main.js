// Falang:icon-start:function:dd65b916-ce1d-498e-b3fe-68d4cb1bc07c
// Falang:icon-start:file_header:6fcf9a0e-b3d5-4e2d-ac19-a7e139a4e42f
// Falang:block-start:icon-box-6fcf9a0e-b3d5-4e2d-ac19-a7e139a4e42f
const { helloWorld } = require('./helloWorld');
// Falang:block-end:icon-box-6fcf9a0e-b3d5-4e2d-ac19-a7e139a4e42f
// Falang:icon-end:file_header:6fcf9a0e-b3d5-4e2d-ac19-a7e139a4e42f
// Falang:icon-start:function_header:6e095fdc-b462-4d15-8d0d-6eb5c793fe94
// Falang:block-start:icon-box-6e095fdc-b462-4d15-8d0d-6eb5c793fe94
exports.main = function()
// Falang:block-end:icon-box-6e095fdc-b462-4d15-8d0d-6eb5c793fe94
// Falang:icon-end:function_header:6e095fdc-b462-4d15-8d0d-6eb5c793fe94
{
  let _continueValue = 0;
  let _breakValue = 0;
  // Falang:icon-start:skewer:4e020259-0312-4a71-8ae8-1835cf76262b
  // Falang:icon-start:foreach:344e5078-6ca1-461d-8ae3-dedc7197b33b
  // Falang:block-start:icon-box-344e5078-6ca1-461d-8ae3-dedc7197b33b
  for (let i = 1; i <= 10; i++)
  // Falang:block-end:icon-box-344e5078-6ca1-461d-8ae3-dedc7197b33b
  {
    // Falang:icon-start:skewer:3db05159-ff0d-491e-8c01-a46be99a7043
    // Falang:icon-start:action:2db5a364-8a46-4c30-b69a-fd66e16631ab
    // Falang:block-start:icon-box-2db5a364-8a46-4c30-b69a-fd66e16631ab
    helloWorld(i);
    // Falang:block-end:icon-box-2db5a364-8a46-4c30-b69a-fd66e16631ab
    // Falang:icon-end:action:2db5a364-8a46-4c30-b69a-fd66e16631ab
    // Falang:icon-end:skewer:3db05159-ff0d-491e-8c01-a46be99a7043
  }
  // Falang:icon-end:foreach:344e5078-6ca1-461d-8ae3-dedc7197b33b
  // Falang:icon-end:skewer:4e020259-0312-4a71-8ae8-1835cf76262b
  // Falang:icon-start:function_footer:ab7be497-ef12-4a82-afb8-f37ff0a92e5c
  // Falang:icon-end:function_footer:ab7be497-ef12-4a82-afb8-f37ff0a92e5c
}
// Falang:icon-end:function:dd65b916-ce1d-498e-b3fe-68d4cb1bc07c