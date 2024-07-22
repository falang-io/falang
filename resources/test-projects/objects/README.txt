To build code run File -> "Build code" in application
Для генерации когда нажмите Файл -> "Сгенерировать код" в приложении

C++:
  Directory: code/cpp
  Command: cmake ./ && cmake --build ./ && ./main

Golang:
  Directory: code/go
  Command: go run ./main.go

JavaScript:
  Directory: code/js
  Command: npm start

Rust:
  Directory: code/rust
  Command: cargo run -r

C#:
  Directory: code/sharp
  Command: dotnet run

TypeScript:
  Directory: code/ts
  Command: npm install && npm start