// Falang:icon-start:function:a9400f3e-fe59-4aaf-924f-2b0174535f7f
// Falang:icon-start:file_header:57d276a3-2ecf-44b6-a913-f43d6aa3e370
// Falang:block-start:icon-box-57d276a3-2ecf-44b6-a913-f43d6aa3e370
mod hello_world;
// Falang:block-end:icon-box-57d276a3-2ecf-44b6-a913-f43d6aa3e370
// Falang:icon-end:file_header:57d276a3-2ecf-44b6-a913-f43d6aa3e370
// Falang:icon-start:function_header:7a08ec6c-a176-4eac-90b7-599ff6976ec0
// Falang:block-start:icon-box-7a08ec6c-a176-4eac-90b7-599ff6976ec0
fn main()
// Falang:block-end:icon-box-7a08ec6c-a176-4eac-90b7-599ff6976ec0
// Falang:icon-end:function_header:7a08ec6c-a176-4eac-90b7-599ff6976ec0
{
  let _continue_value: i32 = 0;
  let _break_value: i32 = 0;
  // Falang:icon-start:skewer:e30f10de-b275-45af-8b27-6296f5f5f2ff
  // Falang:icon-start:foreach:f2e1cd1b-11b0-41ba-a9d7-11eccd8c4d51
  // Falang:block-start:icon-box-f2e1cd1b-11b0-41ba-a9d7-11eccd8c4d51
  for number in (1..10).rev()
  // Falang:block-end:icon-box-f2e1cd1b-11b0-41ba-a9d7-11eccd8c4d51
  {
    // Falang:icon-start:skewer:c03c0721-a6b5-4807-af38-9ac69df50070
    // Falang:icon-start:action:b89e497e-018b-4d8c-a9bb-624d61a250a7
    // Falang:block-start:icon-box-b89e497e-018b-4d8c-a9bb-624d61a250a7
    hello_world::hello_world(number);
    // Falang:block-end:icon-box-b89e497e-018b-4d8c-a9bb-624d61a250a7
    // Falang:icon-end:action:b89e497e-018b-4d8c-a9bb-624d61a250a7
    // Falang:icon-end:skewer:c03c0721-a6b5-4807-af38-9ac69df50070
  }
  // Falang:icon-end:foreach:f2e1cd1b-11b0-41ba-a9d7-11eccd8c4d51
  // Falang:icon-end:skewer:e30f10de-b275-45af-8b27-6296f5f5f2ff
  // Falang:icon-start:function_footer:d9a98e13-4b11-4266-91eb-3c002748c1a3
  // Falang:icon-end:function_footer:d9a98e13-4b11-4266-91eb-3c002748c1a3
}
// Falang:icon-end:function:a9400f3e-fe59-4aaf-924f-2b0174535f7f